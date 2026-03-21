import sys
import json
import os
from datetime import datetime, timedelta, time
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo
from typing import List, Tuple, Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

TIME_ZONE_NAME = "Asia/Beirut"
TZ = ZoneInfo(TIME_ZONE_NAME)

BUSINESS_START = time(9, 0)
BUSINESS_END = time(22, 0)
SEARCH_DAYS = 14
MEETING_MINUTES = 60

def parse_rfc3339(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).astimezone(TZ)

def merge_intervals(intervals: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda x: x[0])
    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1][1] = max(last_end, end)
        else:
            merged.append([start, end])
    return [(s, e) for s, e in merged]

def get_busy_blocks(service, calendar_id: str, time_min: datetime, time_max: datetime) -> List[Tuple[datetime, datetime]]:
    body = {
        "timeMin": time_min.isoformat(),
        "timeMax": time_max.isoformat(),
        "timeZone": TIME_ZONE_NAME,
        "items": [{"id": calendar_id}],
    }
    resp = service.freebusy().query(body=body).execute()
    busy = resp["calendars"].get(calendar_id, {}).get("busy", [])
    return [(parse_rfc3339(item["start"]), parse_rfc3339(item["end"])) for item in busy]

def find_first_common_slot(
    busy_a: List[Tuple[datetime, datetime]],
    busy_b: List[Tuple[datetime, datetime]],
    search_start: datetime,
    search_end: datetime,
    duration_minutes: int = MEETING_MINUTES,
) -> Optional[Tuple[datetime, datetime]]:
    duration = timedelta(minutes=duration_minutes)
    merged_busy = merge_intervals(busy_a + busy_b)

    day = search_start.date()
    last_day = search_end.date()

    while day <= last_day:
        day_start = datetime.combine(day, BUSINESS_START, tzinfo=TZ)
        day_end = datetime.combine(day, BUSINESS_END, tzinfo=TZ)

        window_start = max(day_start, search_start) if day == search_start.date() else day_start
        window_end = min(day_end, search_end) if day == search_end.date() else day_end

        if window_start < window_end:
            cursor = window_start
            for busy_start, busy_end in merged_busy:
                if busy_end <= window_start or busy_start >= window_end:
                    continue
                if cursor + duration <= busy_start:
                    return cursor, cursor + duration
                cursor = max(cursor, busy_end)
                if cursor >= window_end:
                    break
            if cursor + duration <= window_end:
                return cursor, cursor + duration
        day += timedelta(days=1)
    return None

def create_date_event(
    organizer_service,
    organizer_calendar_id: str,
    start_dt: datetime,
    end_dt: datetime,
    user1_email: str,
    user2_email: str,
):
    event = {
        "summary": "BuzzMate Date \U0001F41D",
        "description": "Your matched date is here! Time to see if the chemistry is real.",
        "start": {
            "dateTime": start_dt.isoformat(),
            "timeZone": TIME_ZONE_NAME,
        },
        "end": {
            "dateTime": end_dt.isoformat(),
            "timeZone": TIME_ZONE_NAME,
        },
        "attendees": [
            {"email": user1_email},
            {"email": user2_email},
        ],
    }

    return organizer_service.events().insert(
        calendarId=organizer_calendar_id,
        body=event,
        sendUpdates="all",
    ).execute()


def build_credentials(refresh_token, client_id, client_secret, token_uri):
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=token_uri,
        client_id=client_id,
        client_secret=client_secret
    )

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: calendar_script.py <mode> [start_time] [end_time]"}))
        sys.exit(1)

    mode = sys.argv[1]
    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
    token_uri = os.environ.get('GOOGLE_TOKEN_URI', 'https://oauth2.googleapis.com/token')
    u1_email = os.environ.get('U1_EMAIL')
    u1_refresh = os.environ.get('U1_REFRESH')
    u2_email = os.environ.get('U2_EMAIL')
    u2_refresh = os.environ.get('U2_REFRESH')

    if not all([client_id, client_secret, u1_email, u1_refresh]):
        print(json.dumps({"error": "Missing essential environment variables"}))
        sys.exit(1)

    try:
        creds1 = build_credentials(u1_refresh, client_id, client_secret, token_uri)
        service1 = build("calendar", "v3", credentials=creds1)

        if mode == "suggest":
            creds2 = build_credentials(u2_refresh, client_id, client_secret, token_uri)
            service2 = build("calendar", "v3", credentials=creds2)

            now = datetime.now(TZ)
            search_start = now
            search_end = datetime.combine((now + timedelta(days=SEARCH_DAYS)).date(), BUSINESS_END, tzinfo=TZ)

            busy1 = get_busy_blocks(service1, "primary", search_start, search_end)
            busy2 = get_busy_blocks(service2, "primary", search_start, search_end)

            slot = find_first_common_slot(busy1, busy2, search_start, search_end, duration_minutes=MEETING_MINUTES)
            if slot is None:
                print(json.dumps({"error": "No common slots found"}))
                sys.exit(0)

            start_dt, end_dt = slot
            
            print(json.dumps({
                "status": "success", 
                "start": start_dt.isoformat(), 
                "end": end_dt.isoformat()
            }))
            
        elif mode == "book":
            if len(sys.argv) < 4:
                print(json.dumps({"error": "Missing start_time and end_time for book mode."}))
                sys.exit(1)
                
            start_dt = parse_rfc3339(sys.argv[2])
            end_dt = parse_rfc3339(sys.argv[3])

            # User 1 acts as the organizer creating the event inviting User 2
            event_result = create_date_event(
                organizer_service=service1,
                organizer_calendar_id="primary",
                start_dt=start_dt,
                end_dt=end_dt,
                user1_email=u1_email,
                user2_email=u2_email,
            )

            print(json.dumps({
                "status": "success", 
                "eventLink": event_result.get('htmlLink')
            }))
        else:
            print(json.dumps({"error": f"Unknown mode: {mode}"}))
            sys.exit(1)

    except HttpError as error:
        print(json.dumps({"error": f"HttpError: {error}"}))
        sys.exit(1)
    except Exception as ex:
        print(json.dumps({"error": f"Exception: {str(ex)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
