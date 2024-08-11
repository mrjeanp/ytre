console.log("insider.js installed")

const ws = new WebSocket("ws://localhost:3000")

ws.addEventListener("open", () => {
  console.log("WS connection opened");
});

/////////////////////// /////////////////////// /////////////////////// ///////////////////////

const movie_player = document.getElementById("movie_player");
const video = window.video = movie_player.querySelector("video");

const audioCtx = new AudioContext();
const elementSource = audioCtx.createMediaElementSource(video);
const streamDest = audioCtx.createMediaStreamDestination();

const recorder = window.recorder = new MediaRecorder(streamDest.stream, { mimeType: "audio/webm;codecs=opus" });

const timer = (() => {
  /**
   * @type Timer
   */
  let interval;
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

elementSource.connect(streamDest);

/**
 * @param {BlobEvent} event 
 */
recorder.ondataavailable = async (event) => {
  const blob = event.data
  ws.send(blob)
  console.log(blob)
};

recorder.onstop = () => {
  timer.stop()
  console.log('Recording stopped');
  SIGNAL("end")
};

recorder.onresume = () => {
  console.log('Recorging resumed')
}

recorder.onstart = () => {
  timer.start()
  console.log("Recording");
};

recorder.onpause = () => {
  timer.stop()
  recorder.requestData()
  recorder.ondataavailable = null
  console.log('Recording paused');
  SIGNAL("pause")
};


video.addEventListener("playing", videoPlayingHandler);
video.addEventListener("play", videoPlayHandler);
video.addEventListener("pause", videoPauseHandler);
video.addEventListener("ended", videoEndedHandler);
video.addEventListener("timeupdate", videoTimeUpdateHandler)

// video.addEventListener("canplay", (ev) => {
//   SIGNAL("duration", ev.target.duration)
// })
function videoTimeUpdateHandler(_event) {
  SIGNAL("set_time", video.currentTime);

}
function videoPlayingHandler() {
  if (showingAds()) {
    SIGNAL("skip_ad")
    return;
  }
  SIGNAL("set_duration", video.duration)
  recorder.state === "inactive" && recorder.start();
  recorder.state === "paused" && recorder.resume();
  console.log('Video playing');
  printStats()
};

function videoPlayHandler() {
  if (showingAds()) return;
  recorder.state === "inactive" && !showingAds() && recorder.start();
  recorder.state === "paused" && !showingAds() && recorder.resume();
  console.log('Video played');
  printStats()
};

function videoPauseHandler() {
  recorder.state !== "inactive" && !showingAds() && (recorder.pause());
  console.log('Video paused');
  printStats()
};

function videoEndedHandler() {
  recorder.state !== "inactive" && !showingAds() && (recorder.stop());
  video.removeEventListener("play", videoPlayHandler);
  video.removeEventListener("playing", videoPlayingHandler);
  video.removeEventListener("pause", videoPauseHandler);
  video.removeEventListener("ended", videoEndedHandler);
  video.removeEventListener("timeupdate", videoTimeUpdateHandler)

  ws.close()

  console.log('Video ended')
  printStats()
};

function printStats() {
  console.log('Ads:', showingAds())
}


function showingAds() {
  return movie_player.classList.contains("ad-showing");
}
