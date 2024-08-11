import puppeteer, { HTTPResponse } from "puppeteer";
import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    ws: {
      type: 'string',
      short: 'w'
    },
  },
  strict: true,
  allowPositionals: true,
});

const fs = require("node:fs")
const path = require("path")
const assert = require("node:assert/strict")

const vid = positionals[2]; assert.ok(vid, "Video ID must not be falsy");
const filename = positionals[3] ?? vid + ".webm"
const url = `https://youtube.com/watch?v=${vid}`

const file = Bun.file(filename)
const writer = file.writer()


// Launch the browser 
const browser = await puppeteer.launch({
  headless: false,
  devtools: true,
  args: [
    "--start-maximized"
  ],

});

const pages = await browser.pages()
const page = pages[0]

/**
 * @type {WebSocket|null}
 */
const ws = values.ws ? new WebSocket(values.ws) : null

let previousSignal = ""
let signal = "";
/**
 * @type {[string,any]}
 */
let consoleSignalArgs = ["", undefined]

let totalBytes = 0

let duration = 0

let currentTime = 0

// websocket server
const server = Bun.serve({
  fetch(req, server) {
    // upgrade the request to a WebSocket
    if (server.upgrade(req)) {
      return; // do not return a Response
    }
    return new Response("Upgrade failed", { status: 500 });
  },

  websocket: {
    open: (_) => {
      console.log("Client opened");
    },
    close: (_) => {
      console.log("Client closed");
      theEnd()
    },
    async message(_, data) {
      try {
        writer.write(data)
        writer.flush()

        if (ws) {
          ws.send(data)
        }

        totalBytes += data.length

        updateConsole()
      }
      catch (e) {
        console.error(e)
      }
    }
  }
});


await page.setCacheEnabled(false)
await page.setRequestInterception(true);

await page.exposeFunction('SIGNAL',
  /**  
   * @param {string} sig
   * @param {object} data
   */
  async (sig, data) => {
    if (!sig) return signal;

    consoleSignalArgs = [
      "SIGNAL", sig,
      ...(data ? ["DATA", data] : [])
    ]

    previousSignal = signal;
    signal = sig

    switch (sig) {
      case "set_duration":
        duration = data
        updateConsole()
        break;
      case "set_time":
        currentTime = data
        updateConsole()
        break;
      case "skip_ad":
        updateConsole("A wild AD has appeared! Clicking skip...")
        skipAds()
        break;
      case "end":
        updateConsole("The End.");
        theEnd()
        break;

      default:
        updateConsole(...consoleSignalArgs);
        break;

    }
  })


page.on('request', req => {
  if (req.isInterceptResolutionHandled()) return;
  if (
    req.resourceType() === "image"
    || req.resourceType() === "font"
    || req.url().includes('.png')
    || req.url().includes('.jpg')
    || req.url().includes('.jpeg')
    || req.url().includes('.webp')
    || req.url().endsWith('.woff2')
  )
    req.abort();
  else {
    req.continue();
  }
});


function updateConsole(...args) {
  try {
    console.clear();
    console.log(
      signal === "end" ? "Recorded" : "Recording...",
      `${formatTime(currentTime)} / ${formatTime(duration)}`,
      '--',
      totalBytes, 'bytes'
    )
    args && console.log(...args)
  }
  catch (e) {
    console.error(e)
    theEnd();
  }
}

/**
 * @param {HTTPResponse} res
 */
async function runInsiderScript(res) {
  const script = fs.readFileSync(path.join(__dirname, './browser/insider.js'), 'utf-8');

  // insider script
  await page.evaluate(script)

}

async function theEnd() {
  server.stop()
  await writer.end()
  await page.close()
  process.exit()
}


function skipAds() {
  const skipButtonSelector = 'button[id*=skip-button]'
  page.locator(skipButtonSelector).setTimeout(0).click()
}

function formatTime(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 3600 % 60);
  return `${h}:${m}:${s}`
}

function clickBigPlay() {
  const ytPlayButtonSelector = 'button[title=Play][aria-label=Play]'
  page.locator(ytPlayButtonSelector).click()
}

page.goto(url, { waitUntil: "load", }).then(runInsiderScript).catch(console.error);