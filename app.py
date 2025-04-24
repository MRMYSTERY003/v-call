from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent", 
                  logger=True, ping_timeout=60, ping_interval=25)  # Prevents timeouts

@app.route('/ping')
def ping():
    return "WebSocket OK", 200

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/call/<room_id>')
def call(room_id):
    return render_template('call.html', room_id=room_id)

def generate_room_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@socketio.on('connect')
def handle_connect():
    print("[INFO] Client connected")

@socketio.on('disconnect')
def handle_disconnect():
    print("[INFO] Client disconnected")

@socketio.on('join')
def handle_join(data):
    room = data['room']
    join_room(room)
    print(f"[INFO] Client joined room {room}")
    emit('joined', {'room': room, 'message': 'You have joined the room'}, room=room)

@socketio.on('leave')
def handle_leave(data):
    room = data['room']
    leave_room(room)
    print(f"[INFO] Client left room {room}")
    emit('left', {'room': room, 'message': 'You have left the room'}, room=room)

@socketio.on('offer')
def handle_offer(data):
    room = data['room']
    print(f"[DEBUG] Received offer in room {room}:", data['offer'])
    emit('offer', {'offer': data['offer'], 'sender': request.sid}, 
         room=room, include_self=False)

@socketio.on('answer')
def handle_answer(data):
    room = data['room']
    print(f"[DEBUG] Received answer in room {room}:", data['answer'])
    emit('answer', {'answer': data['answer'], 'sender': request.sid}, 
         room=room, include_self=False)

@socketio.on('candidate')
def handle_candidate(data):
    room = data['room']
    print(f"[DEBUG] Received candidate in room {room}:", data['candidate'])
    emit('candidate', {'candidate': data['candidate'], 'sender': request.sid}, 
         room=room, include_self=False)

if __name__ == '__main__':
    print("[INFO] Starting server...")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
