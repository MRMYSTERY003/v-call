let callFrame = null;

async function setup() {
  const res = await fetch("/get-room");
  const data = await res.json();
  const roomUrl = data.url;

  callFrame = window.DailyIframe.createFrame({
    iframeStyle: {
      display: 'none',
    }
  });

  await callFrame.join({ url: roomUrl });

  document.getElementById("talk-btn").disabled = false;
  console.log("Joined room:", roomUrl);
}

document.getElementById("join-btn").onclick = setup;

const talkBtn = document.getElementById("talk-btn");

talkBtn.addEventListener("mousedown", () => {
  callFrame.setLocalAudio(true);
});

talkBtn.addEventListener("mouseup", () => {
  callFrame.setLocalAudio(false);
});

talkBtn.addEventListener("touchstart", () => {
  callFrame.setLocalAudio(true);
});

talkBtn.addEventListener("touchend", () => {
  callFrame.setLocalAudio(false);
});
