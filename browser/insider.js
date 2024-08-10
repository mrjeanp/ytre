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

recorder.onstart = recorder.onresume = () => {
  timer.start()
  console.log("Recording");
  SIGNAL("recording")
};

recorder.onpause = () => {
  timer.stop()
  recorder.requestData()
  recorder.ondataavailable = null
  console.log('Recording paused');
  SIGNAL("end")
};


video.addEventListener("playing", videoPlayingHandler);
video.addEventListener("play", videoPlayHandler);
video.addEventListener("pause", videoPauseHandler);
video.addEventListener("ended", videoEndedHandler);

function videoPlayingHandler() {
  recorder.state === "inactive" && !showingAds() && recorder.start();
  recorder.state === "paused" && !showingAds() && recorder.resume();
  if (showingAds()) {
    SIGNAL("ads")
  }
  console.log('Video playing');
  printStats()
};

function videoPlayHandler() {
  recorder.state === "inactive" && !showingAds() && recorder.start();
  recorder.state === "paused" && !showingAds() && recorder.resume();
  if (showingAds()) {
    SIGNAL("ads")
  }
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
