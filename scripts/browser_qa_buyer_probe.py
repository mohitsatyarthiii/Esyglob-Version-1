import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"F:\Desktop\esyglob-app")
OUT = ROOT / "qa-browser-artifacts"
OUT.mkdir(exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "https://esyglob.in"
TARGET_PATH = os.environ.get("QA_TARGET_PATH", "/products/6a6e175e03795705208a0970")

def controls(page):
    return page.locator("button, a, input, textarea, select").evaluate_all("""els => els.map((el, i) => ({i, tag: el.tagName, text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim(), href: el.href || '', name: el.name || '', type: el.type || ''})).filter(x => x.text || x.href)""")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=False)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
    page.get_by_label("Business email").fill("mohit11@gmail.com")
    page.get_by_label("Password", exact=True).fill(os.environ["QA_BUYER_PASSWORD"])
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=30000)
    page.goto(f"{BASE}{TARGET_PATH}", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / "buyer-urbanwood-product.png"), full_page=True)
    result = {"url": page.url, "text": page.locator("body").inner_text()[:5000], "controls": controls(page)}
    (OUT / "buyer-product-probe.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    context.close()
    browser.close()
