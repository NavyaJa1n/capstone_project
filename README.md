# Seawater Intrusion with a Cutoff Wall

A small web calculator for the analytical solution of Sun et al. (2026), *Advances in Water Resources* 212, 105301
(https://doi.org/10.1016/j.advwatres.2026.105301).

Given aquifer, wall and fluid properties, it identifies which of the paper's six scenarios (a-f) applies,
computes the freshwater-seawater interface toe with and without the wall, and draws the interface profile
for that scenario.

## Scope

- Confined aquifer, constant inland flux (Eqs. 8, 17-23 for the toe; Eqs. 9-16 and 7 for the profile).
- No mixing correction (Eq. 43/44) is applied, so toe values are sharp-interface values.
- Unconfined and "Other aquifer types" tabs are placeholders.
- Steady state, sharp interface, Dupuit-Forchheimer assumption. Results near the wall are approximate (see paper, Sec. 2.2 and 3.1).

## Requirements

- Python 3.9 or newer
- Internet access in the browser (Plotly is loaded from the jsDelivr CDN)

## Run locally

1. Unzip the project and open a terminal in the `cutoff_app` folder.
2. Create a virtual environment:
   - Windows: `python -m venv venv` then `venv\Scripts\activate`
   - macOS/Linux: `python3 -m venv venv` then `source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Start the app: `python app.py`
5. Open http://127.0.0.1:5000


## Using the app

1. Check or change the input values. Defaults reproduce the paper's large-scale confined case.
2. Press **Process output** (or press Enter in the last field).
3. Read the scenario, toe positions and percentage reduction in intrusion length.
4. Use the graph: hover points for values; press the **i** button beside the title for an explanation.
5. **Download snapshot** saves inputs and outputs as a text file. **Reset to defaults** restores the paper's values.

Invalid inputs are marked in red with the reason, for example wall opening height not smaller than aquifer thickness.

## Project layout

| File | Purpose |
|---|---|
| `app.py` | Flask server and API (`/api/config`, `/api/calculate`, `/api/snapshot`) |
| `calc.py` | Input validation, scenario test, toe and profile equations |
| `static/` | `index.html`, `style.css`, `app.js` (front end) |
| `Procfile`, `render.yaml` | Deployment settings |
| `requirements.txt` | Python dependencies |

## Environment variables

- `HOST` (default `127.0.0.1`) and `PORT` (default `5000`) for `python app.py`.
- `WEB_CONCURRENCY` sets the gunicorn worker count when using the Procfile.

## Citation

Sun, J., Shi, W., Wu, H., Yang, J., Lu, C. (2026). A novel analytical solution for quantifying seawater intrusion
in coastal aquifers embedded with a cutoff wall. *Advances in Water Resources*, 212, 105301.
