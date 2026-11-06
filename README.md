# analytics-portfolio

Personal portfolio of **Ghanashyam Mandal** (B.Tech Chemical Engineering, IIT Madras, 2027), with six working analytics and AI prototypes that run entirely in the browser.

> Personal portfolio. Not affiliated with or endorsed by Deloitte. All datasets in the demos are sample data for demonstration. None of the prototypes has been used by a client or company.

- Static site: HTML, CSS and vanilla JavaScript. No build step, no backend, no API keys, no paid services.
- Libraries load from pinned CDN versions: d3 7.8.5 and Chart.js 4.4.1 (cdnjs). MediaPipe Tasks Vision 0.10.14 (jsDelivr) loads only when a visitor starts the vision demo.
- Works on phones (tested at 375 px wide), keyboard accessible, light and dark mode.

## Structure

```
index.html          all five sections and the demo markup
css/styles.css      design tokens (light/dark), layout, responsive rules
js/core.js          shared helpers (seeded random numbers, colours, formatting)
js/app.js           navigation, Back/Next, theme toggle, demo lifecycle, copy email
js/rag.js           a. RAG assistant
js/agent.js         b. Agentic procurement workflow
js/graph.js         c. Supply-chain knowledge graph
js/forecast.js      d. Demand forecasting
js/spc.js           e. Manufacturing quality monitor (SPC)
js/vision.js        f. Hand-gesture recognition
assets/             put Ghanashyam_Mandal_Resume.pdf here
.nojekyll           tells GitHub Pages to serve the files as they are
```

Navigation uses URL hashes, so every section and demo has a shareable link, for example `#lab/forecast`. Back/Next steps through Home, each of the six demos, Case studies, How I work and Contact.

## The prototypes

Each demo starts with sample data already showing. Sample data is generated from a fixed random seed, so it is the same on every load, and every metric on screen (MAPE, control limits, centrality and so on) is computed live in the browser.

### a. RAG assistant for plant SOPs (`js/rag.js`)
- **Data:** 10 short mock documents (safety SOP, lockout/tagout, spill response, incoming inspection, CAPA, procurement approvals, supplier risk, calibration, stability testing, hot work). Each is labelled "(sample)".
- **Method:** documents are split into 2-sentence passages. Tokens are lower-cased, stop-words removed and lightly stemmed. Each passage gets a TF-IDF vector (log-scaled term frequency × smoothed IDF, L2-normalised). The query is vectorised the same way and passages are ranked by cosine similarity. The top 3 are shown with their scores and matched terms highlighted.
- **Answer:** extractive. The sentences from the strongest passages that best match the query terms are quoted with citations like `[D6 ¶1]`. If the top cosine score is below 0.08 the assistant says it has no good match instead of guessing.
- **Your own text:** paste text, click "Add to index", and optionally search only your text. Nothing leaves the browser.

### b. Agentic procurement workflow (`js/agent.js`)
- **Data:** 6 sample SKUs and 2 to 3 fictional suppliers each (cost, lead time, risk score, MOQ). "On hand" is editable.
- **Loop:** the agent writes a plan, then repeats act → observe → reason with named tools: `get_inventory`, `check_reorder`, `score_suppliers`, `draft_po`, `check_policy`, `request_human_approval`. Each step appears in a live trace.
- **Rules:** supplier score is a weighted sum of min-max normalised cost, lead time and risk (weights set by sliders). Suppliers with risk above 70 are skipped. If stock cover in days is shorter than the chosen supplier's lead time, the agent re-plans and picks the fastest acceptable supplier. Order quantity tops stock up to the maximum, rounded up to MOQ. The approval tier follows the sample procurement policy (D6) used in the RAG demo.
- **Human in the loop:** the run pauses for Approve or Reject. Approval is simulated; nothing is sent anywhere.

### c. Supply-chain knowledge graph (`js/graph.js`)
- **Data:** 6 fictional suppliers, 9 components, 5 products and 3 plants, with "supplies", "used in" (bill of materials) and "made at" edges.
- **Disruption:** click a supplier node (or its button) to toggle a disruption. A component is lost if all its suppliers are down and at risk if only some are; a product is lost if any of its components is lost; plants inherit from their products.
- **Shortest path:** breadth-first search between any two nodes, highlighted in teal.
- **Criticality:** suppliers are ranked by how many products they would take down alone, then by products put at risk, then by betweenness centrality (Brandes algorithm, normalised). The page opens with the top-ranked supplier disrupted.
- **Layout:** d3 force simulation with layered positioning (left to right on desktop, top to bottom on phones). Nodes can be dragged.

### d. Demand forecasting (`js/forecast.js`)
- **Data:** 48 months of sample demand (trend + yearly seasonality + noise).
- **Models:** additive Holt-Winters (season = 12), Holt linear trend and simple exponential smoothing, all written from scratch. Smoothing weights are chosen by grid search (0.05 to 0.95) to minimise one-step-ahead squared error.
- **Honest accuracy:** the last 12 months (a quarter of the data for short uploads) are held out. Each method is fitted on the rest, and MAPE on the hold-out is shown for all three methods side by side.
- **Forecast:** the selected method is refitted on all data and projected 1 to 24 months ahead (slider). The band is an approximate 95% interval, ±1.96 × residual σ × √h.
- **CSV upload:** any CSV whose last column is numeric (an optional first column is used as the label). Header rows are skipped. At least 10 rows are needed, and Holt-Winters needs two full seasons in the training part. "Sample CSV" downloads the sample series to show the format.

### e. Manufacturing quality monitor (`js/spc.js`)
- **Data:** a simulated viscosity sensor (target 3000 mPa·s), subgroups of 5 readings, one new subgroup per second.
- **Limits:** from the first 25 subgroups. X̄ chart: grand mean ± A2·R̄ (A2 = 0.577). R chart: D3·R̄ to D4·R̄ (D3 = 0, D4 = 2.114). σ of the mean = A2·R̄/3.
- **Western Electric rules**, checked on every new point: (1) one point beyond 3σ; (2) 2 of 3 beyond 2σ on the same side; (3) 4 of 5 beyond 1σ on the same side; (4) 8 in a row on one side. R-chart breaches are flagged too.
- **Controls:** pause, inject a shift, a drift or a spike, restore. The preloaded history includes a small shift so violations are visible on load.
- **Pareto:** sample defect-cause counts, sorted, with a cumulative % line and an 80% reference line.
- **Link to my work:** this mirrors the early-warning framework for product instability I proposed at L'Oréal R&D: catch a trend in lab measurements before it becomes a failed product.

### f. Vision: hand-gesture recognition (`js/vision.js`)
- **Privacy:** the camera starts only on a button click. Frames and uploaded images are processed on the device. Only the MediaPipe library and model file are downloaded (jsDelivr and Google's public model storage). The camera stops when you leave the demo.
- **Method:** MediaPipe Hand Landmarker finds 21 landmarks per hand. A finger is "up" when its tip is further from the wrist than its middle joint; the thumb is compared against the base of the little finger. The pattern maps to gestures (fist, open palm, pointing, peace, thumbs up and others). An optional tone plays one note per finger count, a nod to the Gestural Music project.
- **Fallbacks:** before the camera starts, the classifier runs on built-in sample landmark sets. Without a camera, upload an image instead.

## Run locally

The camera and ES-module loading need `http://localhost` (or HTTPS), so use a small local server instead of opening the file directly.

With Python 3:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Or with Node.js:

```bash
npx serve .
```

## Deploy on GitHub Pages (repo name: analytics-portfolio)

1. Sign in to GitHub and create a new repository named `analytics-portfolio`. Make it **Public** (Pages on private repos needs a paid plan). Do not add a README there; this folder already has one.
2. Add your resume as `assets/Ghanashyam_Mandal_Resume.pdf` (optional, but the Resume buttons link there).
3. In a terminal inside this folder, run these one at a time (replace `YOUR-USERNAME`):

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Analytics portfolio with six in-browser prototypes"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/analytics-portfolio.git
```

```bash
git push -u origin main
```

4. On GitHub, open the repository → **Settings** → **Pages**.
5. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then click **Save**.
6. Wait 1 to 2 minutes and refresh the Pages settings. Your site will be at `https://YOUR-USERNAME.github.io/analytics-portfolio/`.
7. Test it on your phone, including the camera demo (GitHub Pages uses HTTPS, which the camera needs).

No upload option? You can also drag the files into the repository page with **Add file → Upload files**, keeping the folder structure (`css/`, `js/`, `assets/`), then follow steps 4 to 6.

To update the site later, edit the files, then run `git add .`, `git commit -m "Update"` and `git push`. Pages redeploys automatically.

## Editing content

- Text for the hero, case studies, How I work and Contact is plain HTML in `index.html`.
- Sample datasets are at the top of each demo's JS file (`DOCS`, `INVENTORY`/`SUPPLIERS`, `NODES`/`BOM`, `sampleSeries`, `DEFECTS`).
- Colours are CSS variables at the top of `css/styles.css` (`--accent` is the teal).
