import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SENDER_EMAIL = os.getenv("ALERT_SENDER_EMAIL", "")
APP_PASSWORD = os.getenv("ALERT_APP_PASSWORD", "")


def send_alert_email(to_email, crop, condition, target_price_kg, current_price_kg):
    """Logs into Gmail and sends the alert to the farmer."""
    if not SENDER_EMAIL or not APP_PASSWORD:
        print("⚠️ ALERT_SENDER_EMAIL or ALERT_APP_PASSWORD not set — skipping email alert.")
        return False

    subject = f"🔔 AgriVani Alert: {crop} Price Hit!"

    body = f"""Hello from AgriVani!

The market price of {crop} has triggered your alert.

Current Market Price: ₹{current_price_kg}/kg
Your Alert Target: {condition.upper()} ₹{target_price_kg}/kg

Check your AgriVani dashboard to plan your next market visit and calculate your highest profit!

Happy Farming,
The AgriVani AI Team
"""

    msg = MIMEMultipart()
    msg["From"] = f"AgriVani Alerts <{SENDER_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.sendmail(SENDER_EMAIL, to_email, msg.as_string())
        server.quit()
        print(f"📧 SUCCESS: Alert email sent to {to_email} for {crop}")
        return True
    except Exception as e:
        print(f"❌ EMAIL ERROR: Could not send to {to_email}. Error: {e}")
        return False
