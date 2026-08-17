import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"F:\Desktop\esyglob-app")
OUT = ROOT / "qa-browser-artifacts"
OUT.mkdir(exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = os.environ.get("QA_BASE_URL", "https://esyglob.in").rstrip("/")
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "laptop": {"width": 1280, "height": 800},
    "tablet": {"width": 768, "height": 1024},
    "mobile": {"width": 390, "height": 844},
}

report = {"pages": [], "console_errors": [], "failed_requests": [], "http_errors": []}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=False)
    context = browser.new_context(viewport=VIEWPORTS["desktop"])
    page = context.new_page()
    page.on("console", lambda message: report["console_errors"].append({"url": page.url, "text": message.text}) if message.type == "error" else None)
    page.on("requestfailed", lambda request: report["failed_requests"].append({"url": request.url, "error": request.failure}))
    page.on("response", lambda response: report["http_errors"].append({"url": response.url, "status": response.status}) if response.status >= 400 else None)

    for route, name in [("/login", "login"), ("/rfqs", "public-rfqs")]:
        for viewport_name, viewport in VIEWPORTS.items():
            page.set_viewport_size(viewport)
            response = page.goto(f"{BASE}{route}", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1500)
            dimensions = page.evaluate("""() => ({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              scrollHeight: document.documentElement.scrollHeight,
              bodyText: document.body.innerText.slice(0, 1200)
            })""")
            screenshot = OUT / f"{name}-{viewport_name}.png"
            page.screenshot(path=str(screenshot), full_page=True)
            report["pages"].append({
                "name": name,
                "viewport": viewport_name,
                "status": response.status if response else None,
                "url": page.url,
                "horizontal_overflow": dimensions["scrollWidth"] > dimensions["clientWidth"] + 1,
                "scroll_width": dimensions["scrollWidth"],
                "client_width": dimensions["clientWidth"],
                "text": dimensions["bodyText"],
                "screenshot": str(screenshot),
            })
    context.close()
    browser.close()

(OUT / "public-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
