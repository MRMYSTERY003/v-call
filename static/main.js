// import DailyIframe from "https://unpkg.com/@daily-co/daily-js";

let callFrame = null;
// const profileImgUrl = "/static/img/pro-rem.png";
const remoteAudioContainer = document.getElementById("remoteAudioContainer");
const roomId = window.location.pathname.split('/').pop();
console.log("Room ID from URL:", roomId);



function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    background-color: ${type === "error" ? "#f44336" : type === "success" ? "#4caf50" : "#333"};
    color: white;
    padding: 12px 18px;
    border-radius: 6px;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    opacity: 0;
    transform: translateY(-10px);
    transition: opacity 0.3s, transform 0.3s;
  `;

  document.getElementById("toast-container").appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}




function visualizeAudio(audioElement, container, userId) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioElement.srcObject);
    source.connect(analyser);
    analyser.fftSize = 32;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function update() {
      if (!audioElement.srcObject || audioElement.srcObject.getTracks().length === 0) return;
      analyser.getByteFrequencyData(dataArray);

      let levelElement;
      if (typeof container === "string") {
        levelElement = document.getElementById(container); // for local visualization
      } else {
        levelElement = container.querySelector(`.audio-level-${userId}`); // for remote
      }

      if (levelElement) {
        const level = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        levelElement.style.width = `${Math.min(100, level * 0.8)}%`;
      }

      requestAnimationFrame(update);
    }

    audioElement.onplaying = update;
  } catch (err) {
    console.error("Audio visualization error:", err);
  }
}


function createRemoteAudioElement(stream, userId) {
  const audioElement = document.createElement("audio");
  audioElement.srcObject = stream;
  audioElement.autoplay = true;
  audioElement.controls = false;
  audioElement.setAttribute("playsinline", "true");

  const container = document.createElement("div");
  container.className = "participant-card";
  container.id = `remote-${userId}`;

  container.innerHTML = `
    <div class="card-inner">
      <div class="card-header">Remote User</div>
      <div class="card-content">
        <div class="l1">
          <div class="avatar">
            <img src="${profileImgUrl}" alt="Avatar">
          </div>
          <div class="name">Connected...</div>
        </div>
        <div class="audio-meter">
          <div class="audio-level audio-level-${userId}" style="width: 0%; height: 8px;"></div>
        </div>
      </div>
    </div>
  `;

  remoteAudioContainer.innerHTML = "";
  remoteAudioContainer.appendChild(container);
  visualizeAudio(audioElement, container, userId);

  audioElement.play().catch((e) => console.error("Audio play error:", e));
}

function setupPushToTalk() {
  const btn = document.getElementById("pushToTalkBtn");
  if (!btn || !callFrame) return;

  let active = false;
  let alwaysTransmit = false;
  let lastTap = 0;

  const start = () => {
    if (!active) {
      active = true;
      callFrame.setLocalAudio(true);
      btn.classList.add("active");
    }
  };

  const stop = () => {
    if (active) {
      active = false;
      callFrame.setLocalAudio(false);
      btn.classList.remove("active");
    }
  };

  btn.addEventListener("mousedown", () => { if (!alwaysTransmit) start(); });
  btn.addEventListener("mouseup", () => { if (!alwaysTransmit) stop(); });
  btn.addEventListener("mouseleave", () => { if (!alwaysTransmit) stop(); });

  let lastTapTime = 0;
  let tapTimeout;

  const handleTap = () => {
    const now = Date.now();
    const diff = now - lastTapTime;
    if (diff < 300) {
      clearTimeout(tapTimeout);
      if (!alwaysTransmit) {
        alwaysTransmit = true;
        start();
      }
    } else {
      tapTimeout = setTimeout(() => {
        if (alwaysTransmit) {
          alwaysTransmit = false;
          stop();
        }
      }, 300);
    }
    lastTapTime = now;
  };

  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!alwaysTransmit) start();
  });

  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (!alwaysTransmit) stop();
    handleTap();
  });

  btn.addEventListener("click", handleTap);

  window.addEventListener("blur", () => {
    if (!alwaysTransmit) stop();
  });
}

async function initializeCall() {
  try {
    // const response = await fetch("/get-room");
    // const { url } = await response.json();

    url = "https://v-call.daily.co/"+roomId
    console.log("Connecting to Daily room:", url);

    callFrame = DailyIframe.createCallObject();


        callFrame.on("error", (e) => {
  console.error("Daily error:", e);
  if (e?.error.msg === "Meeting is full") {
    showToast("🚫 Room is full. Only 2 users can join at a time.");
    console.log("🚫 Room is full. Only 2 users can join at a time.");
  } else {
    console.log("An error occurred: " + e?.errorMsg);
    showToast("An error occurred: " + e?.errorMsg);
  }
});

    await callFrame.join({ url });

    callFrame.setLocalAudio(false); // Start muted
    setupPushToTalk();
    document.getElementById("pushToTalkBtn").disabled = false;

    console.log("Joined Daily room:", url);

    callFrame.on("participant-joined", (e) => {
      const { participant } = e;
      if (participant.local) return;

      const waitingCard = document.getElementById("remote-waiting");
    if (waitingCard) waitingCard.querySelector(".name").textContent = "Connected";


      const audioTrack = participant.audioTrack;
      if (audioTrack && audioTrack.readyState === "live") {
        const stream = new MediaStream([audioTrack]);
        createRemoteAudioElement(stream, participant.session_id);
      }
    });
    callFrame.on("track-started", (e) => {
    const { participant, track } = e;

    // ✅ LOCAL AUDIO visualization
    if (participant.local && track.kind === "audio") {
        const stream = new MediaStream([track]);
        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.muted = true;
        audio.autoplay = true;
        audio.play().catch(() => {});
        visualizeAudio(audio, "localAudioLevel", "local");
    }

    // ✅ REMOTE AUDIO (if not already handled)
    if (!participant.local && track.kind === "audio") {
        const stream = new MediaStream([track]);

          // Remove waiting card if present
        const waitingCard = document.getElementById("remote-waiting");
        if (waitingCard) waitingCard.remove();

        createRemoteAudioElement(stream, participant.session_id);
    }
    });




    callFrame.on("participant-left", (e) => {
      const id = e.participant.session_id;
      const elem = document.getElementById(`remote-${id}`);
      if (elem) elem.remove();
        // Show waiting card again
        renderWaitingRemoteCard();

    });
  } catch (err) {
    console.error("Error setting up Daily:", err);
  }
}

function renderWaitingRemoteCard() {
  remoteAudioContainer.innerHTML = `
    <div class="participant-card" id="remote-waiting">
      <div class="card-inner">
        <div class="card-header">Remote User</div>
        <div class="card-content">
          <div class="l1">
            <div class="avatar">
              <img src="${profileImgUrl}" alt="Avatar">
            </div>
            <div class="name">Waiting for connection...</div>
          </div>
          <div class="audio-meter">
            <div class="audio-level" style="width: 0%; height: 8px;"></div>
          </div>
        </div>
      </div>
    </div>`;
}



window.addEventListener("DOMContentLoaded", () => {
  initializeCall();
renderWaitingRemoteCard();


  window.addEventListener("beforeunload", () => {
    if (callFrame) {
      callFrame.leave();
      callFrame.destroy();
    }
  });
});
