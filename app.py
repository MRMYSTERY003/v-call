from flask import Flask, render_template, jsonify, request
import os
import requests
import uuid

app = Flask(__name__)

DAILY_API_KEY = os.getenv("DAILY_API_KEY")  # Set this in your environment
print(f"DAILY_API_KEY: {DAILY_API_KEY}")
DAILY_API_BASE = "https://api.daily.co/v1"

headers = {
    "Authorization": f"Bearer {DAILY_API_KEY}",
    "Content-Type": "application/json"
}

# Serve the main UI
@app.route("/")
def index():
    return render_template("index.html")


@app.route('/call/<room_id>')
def join_room(room_id):
    return render_template('call.html', room_id=room_id)

# ✅ Create a new room dynamically
@app.route('/create-room', methods=['POST'])
def create_room():
    data = request.get_json()
    room_id = data.get("room_id")

    headers = {
        "Authorization": f"Bearer {DAILY_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "name": room_id,
        "properties": {
            "enable_chat": False,
            "start_video_off": True,
            "start_audio_off": False,
            "enable_knocking": False,
            "enable_network_ui": False,
            "max_participants": 2
        }
    }

    try:
        response = requests.post("https://api.daily.co/v1/rooms", json=payload, headers=headers)

        if response.status_code == 200 or response.status_code == 201:
            return jsonify({"url": response.json()["url"]})
        elif response.status_code == 400:  # Already exists
            return jsonify({"url": f"https://v-call.daily.co/{room_id}"}), 200
        else:
            print(f"Error creating room: {response.status_code} - {response.text}")
            return jsonify({"error": "Room creation failed"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

# ✅ Get room info (e.g., participant count limit)
@app.route("/room-info/<room_name>")
def get_room_info(room_name):
    url = f"{DAILY_API_BASE}/rooms/{room_name}"
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        max_participants = data.get("config", {}).get("max_participants", 2)
        return jsonify({ "max_participants": max_participants })
    else:
        return jsonify({ "error": "Failed to fetch room info", "details": response.text }), 500

# ✅ (Optional) If you want to return static room always
@app.route("/get-room")
def get_static_room():
    return jsonify({ "url": "https://v-call.daily.co/oo5UVX7GAlMzSysGVKhR" })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
