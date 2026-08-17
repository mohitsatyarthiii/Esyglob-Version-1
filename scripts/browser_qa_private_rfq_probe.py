import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"F:\Desktop\esyglob-app\qa-browser-artifacts")
BASE = "https://esyglob.in"
PRODUCT_ID = "6a6e175e03795705208a0970"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=False)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
    page.get_by_label("Business email").fill("mohit11@gmail.com")
    page.get_by_label("Password", exact=True).fill(os.environ["QA_BUYER_PASSWORD"])
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=30000)
    page.goto(f"{BASE}/products/{PRODUCT_ID}", wait_until="networkidle", timeout=60000)
    page.get_by_role("button", name="Send RFQ", exact=True).first.click()
    page.wait_for_url(lambda url: "/rfqs/new" in url, timeout=30000)
    page.wait_for_timeout(1800)
    path = OUT / "private-rfq-form.png"
    page.screenshot(path=str(path), full_page=True)
    result = {
      "url": page.url,
      "text": page.locator("body").inner_text()[:5000],
      "fields": page.locator("input, textarea, select").evaluate_all("els => els.map(el => ({tag: el.tagName, label: el.labels?.[0]?.innerText || '', name: el.name, type: el.type, value: el.value, placeholder: el.placeholder, disabled: el.disabled}))"),
      "buttons": page.get_by_role("button").all_inner_texts(),
      "screenshot": str(path),
    }
    print(json.dumps(result, indent=2))
    (OUT / "private-rfq-probe.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    context.close()
    browser.close()
