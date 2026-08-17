import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"F:\Desktop\esyglob-app\qa-browser-artifacts")
OUT.mkdir(exist_ok=True)
BASE = "https://esyglob.in"
PRODUCT_ID = "6a6e175e03795705208a0970"
run_id = f"webqa-{int(time.time())}"
report = {"run_id": run_id, "dialogs": [], "screens": {}, "console_errors": [], "http_errors": []}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=False)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.on("console", lambda message: report["console_errors"].append({"url": page.url, "text": message.text}) if message.type == "error" else None)
    page.on("response", lambda response: report["http_errors"].append({"url": response.url, "status": response.status}) if response.status >= 400 and not (response.status == 401 and response.url.endswith("/auth/me")) else None)
    page.on("dialog", lambda dialog: (report["dialogs"].append({"type": dialog.type, "message": dialog.message}), dialog.accept()))

    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
    page.get_by_label("Business email").fill("mohit11@gmail.com")
    page.get_by_label("Password", exact=True).fill(os.environ["QA_BUYER_PASSWORD"])
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=30000)

    page.goto(f"{BASE}/products/{PRODUCT_ID}", wait_until="networkidle", timeout=60000)
    page.get_by_role("button", name="Chat Now", exact=True).first.click()
    dialog = page.get_by_role("dialog", name="Send enquiry")
    dialog.wait_for(timeout=10000)
    report["modal_text"] = dialog.inner_text()
    modal_path = OUT / f"{run_id}-enquiry-modal.png"
    page.screenshot(path=str(modal_path), full_page=True)
    report["screens"]["modal"] = str(modal_path)
    dialog.get_by_label("Enquiry message").fill(f"{run_id}: Please confirm availability and commercial details for 100 chairs.")
    dialog.get_by_label("Quantity").fill("100")
    dialog.get_by_label("Additional notes").fill("Browser QA enquiry; standard export packaging and delivery to India.")
    dialog.get_by_role("button", name="Send enquiry").click()
    page.get_by_text("Your enquiry was sent to the supplier.").wait_for(timeout=30000)
    success_path = OUT / f"{run_id}-enquiry-success.png"
    page.screenshot(path=str(success_path), full_page=True)
    report["screens"]["success"] = str(success_path)
    report["success_text"] = page.locator("body").inner_text()[:1600]

    page.goto(f"{BASE}/messages", wait_until="networkidle", timeout=60000)
    page.get_by_text("UrbanWood Industries", exact=True).first.click()
    page.wait_for_timeout(2500)
    messages_text = page.locator("body").inner_text()
    report["message_visible"] = run_id in messages_text
    report["messages_excerpt"] = messages_text[-2500:]
    messages_path = OUT / f"{run_id}-buyer-message.png"
    page.screenshot(path=str(messages_path), full_page=True)
    report["screens"]["messages"] = str(messages_path)

    page.goto(f"{BASE}/rfqs", wait_until="networkidle", timeout=60000)
    report["rfq_created_accidentally"] = run_id in page.locator("body").inner_text()
    context.close()
    browser.close()

(OUT / f"{run_id}-enquiry-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
