# Image Rock Paper Scissors

A Python/Flask game whose webcam recognition runs in the browser using a Google
Teachable Machine TensorFlow.js image model.

## Train and export the model

1. Create an **Image Project** in Teachable Machine.
2. Name the three classes `Rock`, `Paper`, and `Scissors` (capitalization does
   not matter). Capture varied examples and train the model.
3. Choose **Export Model → TensorFlow.js**.
4. Either upload/share the model and copy its URL, or download it and copy all
   exported files into `static/model/`.

The app is preconfigured to use
`https://teachablemachine.withgoogle.com/models/UYVP_XDRN/`.

## Run

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py app.py
```

Open <http://127.0.0.1:5000>, enter the model URL (or leave the local default),
and click **Start camera**. Allow camera access when prompted.

The app requires a move to stay above 85% confidence for 1.2 seconds, then
starts a 1.8-second cooldown so one hand sign does not trigger many rounds.
These values can be changed at the top of `static/app.js`.

## Important

This is still a Python program: Python serves the app, chooses the computer's
move, decides the winner, and tracks score. TensorFlow.js runs only the exported
image model because that is the runtime format supplied by Teachable Machine.
The CDN scripts require an internet connection; the trained model can be local.
