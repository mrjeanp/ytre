console.log("insider.js installed")


// The socket connection
const ws = new WebSocket("ws://localhost:3000")

// HTML elements
const movie_player = document.getElementById("movie_player");
const video = movie_player.querySelector("video");

// Audio objects
const audioCtx = new AudioContext();
const elementSource = audioCtx.createMediaElementSource(video);
const streamDest = audioCtx.createMediaStreamDestination();

// The Recorder
const recorder = new MediaRecorder(streamDest.stream, { mimeType: "audio/webm;codecs=opus" });

// A custom timer
const timer = (() => {
  /**
   * @type Timer
   */
  let interval = null;
  return {
    start() {
      interval ??= setInterval(() => recorder.requestData(), 1000)
    },
    stop() {
      clearInterval(interval)
      interval = null
    }
  }
})()

// connect the video to the recorder
elementSource.connect(streamDest);

// Reset video in case it played too soon
setTimeout(() => {
  video.pause()
  video.currentTime = 0
  attachEvents()
  video.play()
}, 0);

ws.addEventListener("open", () => {
  console.log("Websocket open");
});


// Globals
window.recorder = recorder
window.video = video


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Event handlers

function attachEvents() {
  /**
   * @param {BlobEvent} event 
   */
  recorder.ondataavailable = onRecordDataAvailable;
  recorder.onstart = onRecordStart
  recorder.onpause = onRecordPause;
  recorder.onresume = onRecordResume
  recorder.onstop = onRecordStop;

  video.addEventListener("play", videoPlayHandler);
  video.addEventListener("playing", videoPlayingHandler);
  video.addEventListener("pause", videoPauseHandler);
  video.addEventListener("ended", videoEndedHandler);
  video.addEventListener("timeupdate", videoTimeUpdateHandler)
}
function dettachEvents() {
  recorder.onstart = null
  recorder.onresume = null
  recorder.ondataavailable = null
  recorder.onpause = null
  video.removeEventListener("play", videoPlayHandler);
  video.removeEventListener("playing", videoPlayingHandler);
  video.removeEventListener("pause", videoPauseHandler);
  video.removeEventListener("ended", videoEndedHandler);
  video.removeEventListener("timeupdate", videoTimeUpdateHandler)
}


////////////////////////////////////
// Recorder handlers

function onRecordDataAvailable(event) {
  const blob = event.data;
  ws.send(blob);
}
function onRecordPause() {
  SIGNAL("pause");
  timer.stop();
  recorder.requestData();
  showDebugInfo()
}
function onRecordStart() {
  SIGNAL("recording")
  timer.start();
  showDebugInfo()
}
function onRecordResume() {
  timer.start()
  showDebugInfo()
}
function onRecordStop() {
  timer.stop();
  showDebugInfo()
  dettachEvents()
  SIGNAL("end");
}


/////////////////////////////////
// Video handlers

function videoTimeUpdateHandler(_event) {
  if (showingAds()) return;
  SIGNAL("set_time", video.currentTime);
}
function videoPlayingHandler() {
  // do not remove
  if (showingAds()) {
    // IMPORTANT: Do not add another skip_ad signal, this will trigger another click and pause the video
    SIGNAL("skip_ad")
    return;
  }
  SIGNAL("set_duration", video.duration)
  recorder.state === "inactive" && recorder.start();
  recorder.state === "paused" && recorder.resume();
}
function videoPlayHandler() {
  if (showingAds()) return; // do not remove
  recorder.state === "inactive" && recorder.start();
  recorder.state === "paused" && recorder.resume();
}
function videoPauseHandler() {
  if (showingAds()) return // do not remove
  recorder.state !== "inactive" && recorder.pause();
};
function videoEndedHandler() {
  if (showingAds()) return; // do not remove
  recorder.state !== "inactive" && (recorder.stop());
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Utils

function showDebugInfo() {
  const debug = {
    Ads: showingAds(),
    Recorder: recorder.state,
    Video: {
      paused: video.paused,
      ended: video.ended,
    },
    websocket: {
      state: ws.readyState,
    }
  }
  console.log(debug)
}


function showingAds() {
  return movie_player.classList.contains("ad-showing");
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
