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

/**
 * @type {string|object}
 */
let lastSignal = "";

let totalBytes = 0

let totalTime = ""
let currentTime = ""

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
      console.log("Client connected");
    },
    close: (_) => {
      console.log("Client disconnected", _.readyState, _.remoteAddress);
      // theEnd()
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


await page.exposeFunction('SIGNAL',
  /**  
   * @param {string} sig
   * @param {object} data
   */
  async (sig, data) => {
    console.log("SIGNAL", sig, 'DATA', data)
    if (!sig) return lastSignal;

    lastSignal = sig

    switch (lastSignal) {
      case "recording":
        updateConsole();
        break;
      case "ads":
        console.log("A wild ad has appeared! Clicking skip...")
        skipAds().catch(console.error)
        break;
      case "end": theEnd()
        break;


    }
  })


function updateConsole() {
  try {
    console.clear();
    console.log("Chrome:", puppeteer.executablePath())
    if (lastSignal === "recording") {
      console.log("Recording...", totalBytes, 'bytes in total.')
    } else if (lastSignal === 'end') {
      console.log("Recorded:", totalBytes, 'bytes in total.')
    }
  }
  catch (e) {
    console.error(e)
  }
}

async function theEnd() {
  updateConsole();
  server.stop()
  await writer.end()
  await page.close()
  process.exit()
}


/**
 * @param {HTTPResponse} res
 */
async function runScript(res) {
  const script = fs.readFileSync(path.join(__dirname, './browser/insider.js'), 'utf-8');

  // insider script
  await page.evaluate(script)

}

function skipAds() {
  const skipButtonSelector = 'button[id*=skip]'
  return page.locator(skipButtonSelector).setTimeout(10_000).click()
}

function clickBigPlay() {
  const ytPlayButtonSelector = 'button[title=Play][aria-label=Play]'
  page.locator(ytPlayButtonSelector).click()
}

page.goto(url, { waitUntil: "load", }).then(runScript).catch(console.error);