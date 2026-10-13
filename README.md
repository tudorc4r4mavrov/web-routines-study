# Privacy Paradox study site

Web app for the bachelor's thesis "The Privacy Paradox and Information Disclosure".
Static site, no build step. Hosted on GitHub Pages.

## Files

- `index.html` – all screens
- `styles.css` – styles for the neutral study pages, the scanner (group A) and the survey (group B)
- `app.js` – study flow, questions, answer coding and data submission
- `apps-script.gs` – Google Apps Script that writes the anonymous data to a Google Sheet

## Setting up data collection

1. Create a new Google Sheet with the university Google account approved for the study.
2. In the sheet, open Extensions > Apps Script, delete the sample code and paste in `apps-script.gs`.
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
4. Copy the web app URL into `submitUrl` at the top of `app.js`.
5. Complete one test run and check that a row appears in the `responses` tab.

While `submitUrl` is empty, the data is downloaded as a JSON file instead, which is useful for testing.

## Before launch

- [ ] Fill in the names, emails, ethics contact and withdrawal date in `CONFIG` (`app.js`)
- [ ] Set `debug: false` in `CONFIG`
- [ ] Set `submitUrl` and confirm a test row reaches the sheet
- [ ] Delete the test rows from the sheet
- [ ] Check that "Halden" is not the name of a real security company in your country
- [ ] Test on a phone and on a desktop browser, in both groups

## Testing

With `debug: true`, a yellow bar at the bottom left shows the assigned group.
"Switch group" changes it and restarts; "Reset" clears the group and the completed flag.

## Data dictionary

| Column | Meaning |
| --- | --- |
| `code` | Random participant code, shown to the participant for withdrawal requests |
| `group` | A = security scanner framing, B = neutral survey framing |
| `device` | `mobile` or `desktop` |
| `pii_*` | 0 = left blank, 1 = plausible answer, 2 = filler or keyboard mash, 3 = said it does not apply |
| `disclosure_score` | Number of `pii_*` fields coded 1 (0 to 5). Main dependent variable |
| `invalid_count` | Number of `pii_*` fields coded 2 |
| `pwm` … `notified` | Answers to the non-sensitive questions (blank = skipped) |
| `concern_1` … `concern_4` | Privacy concern items, 1 to 7. Average them for the concern score |
| `trust` | Trust in websites, 1 to 7 (not part of the concern score) |
| `efficacy`, `behaviour` | Self-reported knowledge and protective behaviour, 1 to 7 |
| `protect_check` | Manipulation check: "this website will keep my information safe", 1 to 7 |
| `attention_ok` | 1 if the attention item was answered with 2 |
| `vuln_pre`, `vuln_post` | Same vulnerability item before and after the report, 1 to 7 |
| `surprise`, `intent` | Post-report ratings, 1 to 7 |
| `truthful` | `all`, `some`, `none` or `na` |
| `suspected` | `no`, `partly` or `yes` |
| `terms_opened`, `terms_seconds`, `terms_kept` | Whether the pre-ticked terms were opened, for how long, and whether the box stayed ticked |
| `details_seconds`, `total_seconds` | Time on the first form and on the whole study |
