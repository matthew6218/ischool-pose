from __future__ import annotations

import random
from dataclasses import dataclass, field

from flask import Flask, jsonify, render_template, request, send_from_directory


MOVES = ("rock", "paper", "scissors")
BEATS = {"rock": "scissors", "paper": "rock", "scissors": "paper"}


@dataclass
class Game:
    player_score: int = 0
    computer_score: int = 0
    draws: int = 0
    round_number: int = 0
    history: list[dict] = field(default_factory=list)

    def play(self, player_move: str) -> dict:
        computer_move = random.choice(MOVES)
        self.round_number += 1

        if player_move == computer_move:
            outcome = "draw"
            self.draws += 1
        elif BEATS[player_move] == computer_move:
            outcome = "win"
            self.player_score += 1
        else:
            outcome = "lose"
            self.computer_score += 1

        result = {
            "round": self.round_number,
            "playerMove": player_move,
            "computerMove": computer_move,
            "outcome": outcome,
        }
        self.history.insert(0, result)
        self.history = self.history[:10]
        return {**result, **self.state()}

    def state(self) -> dict:
        return {
            "playerScore": self.player_score,
            "computerScore": self.computer_score,
            "draws": self.draws,
            "roundNumber": self.round_number,
            "history": self.history,
        }

    def reset(self) -> None:
        self.player_score = 0
        self.computer_score = 0
        self.draws = 0
        self.round_number = 0
        self.history.clear()


app = Flask(__name__)
game = Game()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/logos/<path:filename>")
def logos(filename: str):
    response = send_from_directory("logos", filename)
    response.mimetype = "image/webp"
    return response


@app.get("/api/state")
def state():
    return jsonify(game.state())


@app.post("/api/play")
def play():
    payload = request.get_json(silent=True) or {}
    move = str(payload.get("move", "")).strip().lower()
    if move not in MOVES:
        return jsonify(error="move must be rock, paper, or scissors"), 400
    return jsonify(game.play(move))


@app.post("/api/reset")
def reset():
    game.reset()
    return jsonify(game.state())


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
