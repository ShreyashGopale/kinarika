"""
WhatsApp integration via the Meta WhatsApp Business Cloud API.

All credentials are read from environment variables (never hard-coded):
  WHATSAPP_TOKEN        – Meta access token (long-lived business token)
  WHATSAPP_PHONE_ID     – numeric WhatsApp Phone Number ID
  WHATSAPP_VERIFY_TOKEN – token used to verify the webhook (default: weservehealthy)
  WHATSAPP_API_VERSION  – Graph API version (default: v21.0)

The module uses only the Python standard library so no new dependency is added.
"""
import os
import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

WHATSAPP_API_VERSION = os.environ.get('WHATSAPP_API_VERSION', 'v21.0')
DEFAULT_VERIFY_TOKEN = 'weservehealthy'


def get_verify_token():
    """Token Meta must present when verifying the webhook."""
    return os.environ.get('WHATSAPP_VERIFY_TOKEN', DEFAULT_VERIFY_TOKEN)


def _get_token():
    return os.environ.get('WHATSAPP_TOKEN', '').strip()


def _get_phone_id():
    return os.environ.get('WHATSAPP_PHONE_ID', '').strip()


def is_configured():
    return bool(_get_token() and _get_phone_id())


def normalize_to_e164(raw):
    """Normalise an Indian mobile number to E.164.

    Staff/customers type 10-digit numbers (e.g. 9876543210) which are stored
    raw; WhatsApp needs +91XXXXXXXXXX. Numbers already carrying a country code
    are passed through.
    """
    raw = str(raw or '').strip()
    if not raw:
        return raw
    if raw.startswith('+'):
        return raw
    digits = ''.join(ch for ch in raw if ch.isdigit())
    if len(digits) == 10:
        return '+91' + digits
    if digits.startswith('91') and len(digits) == 12:
        return '+' + digits
    return '+' + digits


def send_whatsapp(to_raw, text):
    """Send a WhatsApp text message via the Meta Cloud API.

    Returns a tuple ``(success, response)``. ``success`` is False (without
    raising) when the integration is not configured or Meta rejects the send,
    so callers can degrade gracefully.
    """
    token = _get_token()
    phone_id = _get_phone_id()
    if not token or not phone_id:
        logger.warning(
            'WhatsApp send skipped – WHATSAPP_TOKEN / WHATSAPP_PHONE_ID not configured'
        )
        return False, {'error': 'WhatsApp integration not configured'}

    to = normalize_to_e164(to_raw)
    url = f'https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_id}/messages'
    payload = {
        'messaging_product': 'whatsapp',
        'to': to,
        'type': 'text',
        'text': {'body': text},
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode('utf-8') or '{}'
            try:
                return True, json.loads(body)
            except ValueError:
                return True, {'raw': body}
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8')
        except Exception:
            pass
        logger.error('WhatsApp send failed: HTTP %s %s', e.code, detail)
        return False, {'error': f'HTTP {e.code}', 'detail': detail}
    except Exception as e:  # network / timeout / dns
        logger.error('WhatsApp send error: %s', e)
        return False, {'error': str(e)}
