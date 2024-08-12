import puppeteer from "puppeteer";
import { parseArgs } from "util";
import { formatTime } from "./util/formatTime";

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
const assert = require("node:assert")

const urlReg = /^http[s]?:\/\/.+\.\w+\/?.*/
const url = positionals[2]; assert.ok(urlReg.test(url), "First CLI Argument (URL) must be valid");
const filename = positionals[3] ?? 'audio.webm'

const file = Bun.file(filename)
const writer = file.writer()


console.log("launching...")
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
      updateConsole("Insider websocket opened")
    },
    close: (_) => {
      updateConsole("Insider websocket was closed")
      end()
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





/**
 * Prepare the page before loading. Setup SIGNAL, inject insider helpers, 
 * and filter non relevant requests.
 */

await page.setCacheEnabled(false)
await page.setRequestInterception(true);

await page.exposeFunction('SIGNAL',
  /**  
   * @param {string} sig
   * @param {object} data
   */
  async (sig, data) => {
    try {

      if (!sig) return signal;

      consoleSignalArgs = [
        "SIGNAL", sig,
        ...(data ? ["DATA", data] : [])
      ]

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
          updateConsole("Showing ad, skipping...")
          skipAds()
          break;
        case "end":
          updateConsole("The End.");
          end()
          break;
        default:
          updateConsole(...consoleSignalArgs);
          break;
      }
    }
    catch (e) {
      console.error(e)
      end()
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

// run the page
page.goto(url, {
  waitUntil: "networkidle0"
}).then(installInsiderScript).catch((e) => {
  console.log("Error",e.message)
  end()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Functions
/////////////

function updateConsole(...args) {
  console.clear();
  console.log("URL", url)
  console.log(
    signal === "end" ? "Recorded" :
      signal === 'pause' ? `Paused` :
        `Recording...`,
    `${formatTime(currentTime)} / ${formatTime(duration)}`,
    '--',
    totalBytes, 'bytes'
  )
  args && console.log(...args)
}


async function installInsiderScript() {
  const script = fs.readFileSync(path.join(__dirname, './browser/insider.js'), 'utf-8');

  await page.evaluate(script)

}

async function end() {
  server.stop()
  await writer.end()
  await page.close()
  process.exit()
}

function skipAds() {
  const skipButtonSelector = 'button[id*=skip-button]'
  page.locator(skipButtonSelector).setTimeout(0).click()
}

// function clickBigPlay() {
//   const ytPlayButtonSelector = 'button[title=Play][aria-label=Play]'
//   page.locator(ytPlayButtonSelector).click()
// }
