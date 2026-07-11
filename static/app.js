const $ = (id) => document.getElementById(id);
const MOVES = ["rock", "paper", "scissors"];
const EMOJI = { rock: "✊", paper: "✋", scissors: "✌️" };
const REQUIRED_STABLE_MS = 1200;
const CONFIDENCE_THRESHOLD = 0.85;
const ROUND_COOLDOWN_MS = 1800;

let model;
let webcam;
let running = false;
let candidate = null;
let candidateSince = 0;
let cooldownUntil = 0;

function normalizeModelBase(value) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function classToMove(className) {
  const text = className.trim().toLowerCase();
  if (text.includes("scissor")) return "scissors";
  if (text.includes("rock")) return "rock";
  if (text.includes("paper")) return "paper";
  return null;
}

async function start() {
  if (running) return;
  $("start").disabled = true;
  $("status").textContent = "Loading pose model…";
  try {
    const base = normalizeModelBase($("model-url").value);
    model = await tmPose.load(`${base}model.json`, `${base}metadata.json`);
    webcam = new tmPose.Webcam(420, 420, true);
    await webcam.setup();
    await webcam.play();
    $("webcam").replaceChildren(webcam.canvas);
    running = true;
    $("status").textContent = "Camera ready. Hold up rock, paper, or scissors.";
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    $("status").textContent = `Could not start: ${error.message}`;
    $("start").disabled = false;
  }
}

async function loop(now) {
  if (!running) return;
  webcam.update();
  const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
  const predictions = await model.predict(posenetOutput);
  const best = predictions.reduce((a, b) => a.probability > b.probability ? a : b);
  const move = classToMove(best.className);

  $("detected-move").textContent = move ? `${EMOJI[move]} ${move}` : best.className;
  $("confidence").textContent = `${Math.round(best.probability * 100)}%`;

  if (move && best.probability >= CONFIDENCE_THRESHOLD && now >= cooldownUntil) {
    if (candidate !== move) {
      candidate = move;
      candidateSince = now;
    }
    const progress = Math.min(1, (now - candidateSince) / REQUIRED_STABLE_MS);
    $("meter-fill").style.width = `${progress * 100}%`;
    if (progress >= 1) await playRound(move, now);
  } else {
    candidate = null;
    candidateSince = 0;
    $("meter-fill").style.width = "0%";
  }
  requestAnimationFrame(loop);
}

async function playRound(move, now) {
  cooldownUntil = now + ROUND_COOLDOWN_MS;
  candidate = null;
  $("meter-fill").style.width = "0%";
  try {
    const response = await fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move }),
    });
    if (!response.ok) throw new Error(await response.text());
    render(await response.json());
  } catch (error) {
    $("status").textContent = `Round failed: ${error.message}`;
  }
}

function render(state) {
  $("player-score").textContent = state.playerScore;
  $("computer-score").textContent = state.computerScore;
  $("draws").textContent = state.draws;
  $("round").textContent = state.roundNumber;
  if (state.playerMove) {
    $("player-move").textContent = EMOJI[state.playerMove];
    $("computer-move").textContent = EMOJI[state.computerMove];
    $("outcome").textContent = { win: "You win!", lose: "Computer wins!", draw: "It's a draw!" }[state.outcome];
  }
  const history = state.history || [];
  $("history").innerHTML = history.length ? history.map(item =>
    `<li><span>Round ${item.round}</span><strong>${EMOJI[item.playerMove]} vs ${EMOJI[item.computerMove]}</strong><em>${item.outcome}</em></li>`
  ).join("") : "<li>No rounds yet.</li>";
}

async function reset() {
  const response = await fetch("/api/reset", { method: "POST" });
  render(await response.json());
  $("player-move").textContent = "?";
  $("computer-move").textContent = "?";
  $("outcome").textContent = "Show your move!";
}

$("start").addEventListener("click", start);
$("reset").addEventListener("click", reset);
fetch("/api/state").then(r => r.json()).then(render);
