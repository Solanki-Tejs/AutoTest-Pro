import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "noreply@autotestpro.com")

def send_otp_email(to_email: str, otp: str, purpose: str) -> bool:
    """
    Sends an OTP verification email to the user.
    Falls back gracefully to console logging if SMTP is unconfigured or encounters connection errors.
    """
    purpose_titles = {
        "register": "Registration Email Verification",
        "forgot_password": "Password Reset Verification",
        "update_password": "Password Update Verification"
    }
    subject = f"AutoTest Pro — {purpose_titles.get(purpose, 'Verification Code')}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 24px; }}
        .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border: 2px solid #111111; padding: 36px; box-shadow: 4px 4px 0px #111111; }}
        .header {{ border-bottom: 2px solid #111111; padding-bottom: 16px; margin-bottom: 24px; }}
        .brand {{ font-size: 14px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; color: #111111; }}
        .title {{ font-size: 22px; font-weight: 700; color: #111111; margin-top: 8px; }}
        .otp-box {{ background: #f3f3f3; border: 2px dashed #111111; padding: 18px; text-align: center; margin: 24px 0; }}
        .otp-code {{ font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.3em; color: #0044ff; }}
        .notice {{ font-size: 12px; color: #666666; line-height: 1.5; }}
        .footer {{ margin-top: 28px; padding-top: 16px; border-top: 1px solid #eeeeee; font-size: 11px; color: #999999; text-transform: uppercase; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="brand">AutoTest Pro Security</div>
          <div class="title">{purpose_titles.get(purpose, 'Verification Code')}</div>
        </div>
        <p style="font-size: 14px; color: #333333; line-height: 1.5;">
          Use the 6-digit one-time authorization code below to complete your request for <strong>{to_email}</strong>.
        </p>
        <div class="otp-box">
          <div class="otp-code">{otp}</div>
        </div>
        <p class="notice">
          This code is valid for <strong>10 minutes</strong>. Never share this code with anyone. If you did not make this request, please disregard this email.
        </p>
        <div class="footer">
          AutoTest Pro Automated Identity Verification
        </div>
      </div>
    </body>
    </html>
    """

    plain_content = f"""
AutoTest Pro — {purpose_titles.get(purpose, 'Verification Code')}

Your one-time authorization code is: {otp}

This code is valid for 10 minutes.
If you did not request this code, please ignore this email.
"""

    # Always log clearly in terminal for local testing/dev transparency
    print(f"\n{'='*60}")
    print(f"[EMAIL SERVICE] >>> OTP FOR {to_email} ({purpose}): {otp}")
    print(f"{'='*60}\n")

    if not SMTP_USER or not SMTP_PASSWORD:
        # Dev mode without configured credentials -> logged to console successfully
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to_email

        msg.attach(MIMEText(plain_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to_email], msg.as_string())
            print(f"[EMAIL SERVICE] Successfully sent OTP email to {to_email}")
            return True
    except Exception as e:
        print(f"[EMAIL SERVICE WARNING] SMTP transmission failed: {e}. (OTP was logged to console above)")
        return True
