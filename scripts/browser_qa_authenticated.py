import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"F:\Desktop\esyglob-app")
OUT = ROOT / "qa-browser-artifacts"
OUT.mkdir(exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = os.environ.get("QA_BASE_URL", "https://esyglob.in").rstrip("/")
USERS = {
    "buyer": ("mohit11@gmail.com", os.environ["QA_BUYER_PASSWORD"]),
    "seller": ("urbanwood@gmail.com", os.environ["QA_SELLER_PASSWORD"]),
}

report = {"users": {}, "console_errors": [], "failed_requests": [], "http_errors": []}

def attach_observers(page, role):
    page.on("console", lambda message: report["console_errors"].append({"role": role, "url": page.url, "text": message.text}) if message.type == "error" else None)
    page.on("requestfailed", lambda request: report["failed_requests"].append({"role": role, "url": request.url, "error": request.failure}))
    page.on("response", lambda response: report["http_errors"].append({"role": role, "url": response.url, "status": response.status}) if response.status >= 400 and not (response.status == 401 and response.url.endswith("/auth/me")) else None)

def snapshot(page, role, name):
    page.wait_for_timeout(1200)
    path = OUT / f"auth-{role}-{name}.png"
    page.screenshot(path=str(path), full_page=True)
    dimensions = page.evaluate("() => ({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth})")
    return {"url": page.url, "title": page.title(), "text": page.locator("body").inner_text()[:1800], "screenshot": str(path), "horizontal_overflow": dimensions["scrollWidth"] > dimensions["clientWidth"] + 1}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=False)
    for role, (email, password) in USERS.items():
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        attach_observers(page, role)
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
        page.get_by_label("Business email").fill(email)
        page.get_by_label("Password", exact=True).fill(password)
        page.get_by_role("button", name="Sign in").click()
        try:
            page.wait_for_url(lambda url: "/login" not in url, timeout=30000)
        except Exception:
            report["users"][role] = {"login": snapshot(page, role, "login-failed")}
            context.close()
            continue

        role_report = {"login": snapshot(page, role, "home")}
        for route, name in [("/account", "account"), ("/messages", "messages"), ("/notifications", "notifications"), ("/rfqs", "rfqs"), ("/quotations", "quotations")]:
            page.goto(f"{BASE}{route}", wait_until="networkidle", timeout=60000)
            role_report[name] = snapshot(page, role, name)
        report["users"][role] = role_report
        context.close()
    browser.close()

(OUT / "authenticated-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
