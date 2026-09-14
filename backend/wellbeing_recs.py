"""Lightweight, offline recommendation helpers for the daily check-in.

This intentionally avoids any external API calls (the deployment may not
have internet access) and instead uses a small curated dataset plus simple
keyword matching on the duty location the person entered.
"""

import re

# --- Vacation spot dataset -------------------------------------------------
# Keyword -> broad region, used to map a free-text duty location to a region
# so we can bias suggestions toward places that are more reachable for a
# family trip from where the person is currently posted.
REGION_KEYWORDS = {
    "jammu": "north", "kashmir": "north", "srinagar": "north", "leh": "north",
    "ladakh": "north", "siachen": "north", "punjab": "north", "amritsar": "north",
    "haryana": "north", "delhi": "north", "gurgaon": "north", "gurugram": "north",
    "himachal": "north", "shimla": "north", "manali": "north", "dharamshala": "north",
    "uttarakhand": "north", "dehradun": "north", "chandigarh": "north",
    "rajasthan": "west", "jaipur": "west", "jodhpur": "west", "udaipur": "west",
    "jaisalmer": "west", "bikaner": "west", "gujarat": "west", "ahmedabad": "west",
    "surat": "west", "mumbai": "west", "pune": "west", "nagpur": "west",
    "maharashtra": "west", "goa": "west",
    "kerala": "south", "kochi": "south", "thiruvananthapuram": "south",
    "tamil nadu": "south", "chennai": "south", "coimbatore": "south",
    "karnataka": "south", "bengaluru": "south", "bangalore": "south",
    "mysuru": "south", "mysore": "south", "andhra": "south", "vizag": "south",
    "visakhapatnam": "south", "telangana": "south", "hyderabad": "south",
    "pondicherry": "south",
    "west bengal": "east", "kolkata": "east", "odisha": "east",
    "bhubaneswar": "east", "puri": "east", "bihar": "east", "patna": "east",
    "jharkhand": "east", "ranchi": "east",
    "assam": "northeast", "guwahati": "northeast", "manipur": "northeast",
    "imphal": "northeast", "nagaland": "northeast", "kohima": "northeast",
    "meghalaya": "northeast", "shillong": "northeast", "sikkim": "northeast",
    "gangtok": "northeast", "arunachal": "northeast", "mizoram": "northeast",
    "tripura": "northeast", "agartala": "northeast",
    "madhya pradesh": "central", "bhopal": "central", "indore": "central",
    "chhattisgarh": "central", "raipur": "central", "uttar pradesh": "central",
    "lucknow": "central", "agra": "central", "varanasi": "central",
    "kanpur": "central", "prayagraj": "central",
}

DESTINATIONS = {
    "north": [
        {"name": "Shimla, Himachal Pradesh", "blurb": "Easy toy-train ride, mall-road walks and cool weather that suit young kids and grandparents alike."},
        {"name": "Manali, Himachal Pradesh", "blurb": "Rivers, orchards and short valley walks make this a relaxed family hill break."},
        {"name": "Rishikesh, Uttarakhand", "blurb": "Gentle riverside walks and calmer stretches of the Ganga alongside optional adventure activities for older kids."},
        {"name": "Amritsar, Punjab", "blurb": "The Golden Temple's langar and evening flag ceremony at Wagah are memorable, low-effort family outings."},
        {"name": "Nainital, Uttarakhand", "blurb": "A lake, boating and cable car make this a compact, easy-to-plan hill getaway."},
        {"name": "Mussoorie, Uttarakhand", "blurb": "Short waterfall treks and a laid-back mall road, good for a quick long-weekend trip."},
    ],
    "west": [
        {"name": "Udaipur, Rajasthan", "blurb": "Palaces and a calm lake make for an easy-paced, photogenic family trip."},
        {"name": "Goa (North or South)", "blurb": "Beaches with calmer stretches for kids, plus forts and markets for a relaxed pace."},
        {"name": "Mount Abu, Rajasthan", "blurb": "Rajasthan's only hill station — a cooler, quieter change of pace with a lake and easy viewpoints."},
        {"name": "Jaipur, Rajasthan", "blurb": "Forts, an elephant sanctuary and markets give everyone in the family something to enjoy."},
        {"name": "Lonavala–Khandala, Maharashtra", "blurb": "Short scenic drives, waterfalls and viewpoints close to Mumbai/Pune, easy for a weekend."},
        {"name": "Statue of Unity, Gujarat", "blurb": "A well-organised day trip with a viewing deck, gardens and boating suited to all ages."},
    ],
    "south": [
        {"name": "Munnar, Kerala", "blurb": "Tea gardens and cool weather make for gentle walks that work well for small children and elders."},
        {"name": "Alleppey backwaters, Kerala", "blurb": "A relaxed houseboat stay is naturally paced for a family, with meals and sightseeing built in."},
        {"name": "Coorg, Karnataka", "blurb": "Coffee estates, waterfalls and a cooler climate for an easy-going few days."},
        {"name": "Ooty, Tamil Nadu", "blurb": "Toy train, botanical gardens and boating — a classic, low-effort hill-station family trip."},
        {"name": "Mysuru, Karnataka", "blurb": "The palace, zoo and gardens are all family-friendly and easy to plan around."},
        {"name": "Pondicherry", "blurb": "Calm beaches, French Quarter walks and a relaxed pace suitable for all ages."},
    ],
    "east": [
        {"name": "Darjeeling, West Bengal", "blurb": "Toy train, tea gardens and mountain views make this an easy, scenic hill trip."},
        {"name": "Puri, Odisha", "blurb": "A calmer beach town with the Jagannath Temple, good for a relaxed short trip."},
        {"name": "Digha, West Bengal", "blurb": "A straightforward, budget-friendly beach getaway within easy reach for a long weekend."},
        {"name": "Bhubaneswar & Konark, Odisha", "blurb": "Temples and the Sun Temple make for an easy one/two-day family circuit."},
    ],
    "northeast": [
        {"name": "Shillong, Meghalaya", "blurb": "Waterfalls, lakes and cool weather — a scenic, unhurried family trip."},
        {"name": "Gangtok, Sikkim", "blurb": "Mountain views and a compact, walkable town make logistics easy with kids."},
        {"name": "Kaziranga, Assam", "blurb": "A jeep safari to see rhinos is a memorable, easy day out for children."},
        {"name": "Tawang, Arunachal Pradesh", "blurb": "A quieter, scenic monastery town for a family that enjoys a slower mountain trip."},
    ],
    "central": [
        {"name": "Khajuraho, Madhya Pradesh", "blurb": "Compact heritage sightseeing that works well as a short, easy family trip."},
        {"name": "Pachmarhi, Madhya Pradesh", "blurb": "Central India's only hill station — waterfalls and viewpoints with a relaxed pace."},
        {"name": "Varanasi, Uttar Pradesh", "blurb": "The evening Ganga Aarti is a memorable, low-effort experience for the whole family."},
        {"name": "Bandhavgarh National Park, Madhya Pradesh", "blurb": "A tiger-safari trip that's usually a hit with children."},
    ],
}

_ALL_REGIONS = list(DESTINATIONS.keys())


def _region_for(text: str):
    if not text:
        return None
    t = text.lower()
    for keyword, region in REGION_KEYWORDS.items():
        if keyword in t:
            return region
    return None


def recommend_vacations(duty_location: str = "", last_trip: str = "", limit: int = 3):
    """Suggest family-friendly vacation spots.

    Prefers destinations in the same broad region as the stated duty
    location (so they're more realistic for a family trip), and skips
    anywhere that closely matches the place they said they last visited.
    """
    duty_location = (duty_location or "").strip()
    last_trip = (last_trip or "").strip().lower()
    region = _region_for(duty_location)

    def excluded(dest):
        if not last_trip:
            return False
        name = dest["name"].lower()
        return last_trip in name or name.split(",")[0].strip() in last_trip

    ordered_regions = [region] + [r for r in _ALL_REGIONS if r != region] if region else list(_ALL_REGIONS)
    picks = []
    seen = set()
    for r in ordered_regions:
        if r is None:
            continue
        for dest in DESTINATIONS.get(r, []):
            if dest["name"] in seen or excluded(dest):
                continue
            picks.append(dest)
            seen.add(dest["name"])
            if len(picks) >= limit:
                break
        if len(picks) >= limit:
            break

    note = "Suggested family getaways" + (f" reachable from {duty_location}" if region else "")
    if last_trip:
        note += f", different from your last trip"
    note += "."
    return picks, note


# --- Breathing exercises ----------------------------------------------------
BREATHING_EXERCISES = [
    {
        "name": "Box breathing (4-4-4-4)",
        "steps": "Inhale for 4 seconds, hold for 4, exhale for 4, hold for 4. Repeat for 2–3 minutes.",
        "best_for": ("Medium", "Low"),
    },
    {
        "name": "4-7-8 calming breath",
        "steps": "Inhale quietly through the nose for 4 seconds, hold for 7, exhale slowly through the mouth for 8. Repeat 4 times.",
        "best_for": ("High",),
    },
    {
        "name": "Extended-exhale breathing",
        "steps": "Inhale for 4 seconds and exhale for 6–8 seconds. The longer exhale helps the body settle. Continue for 2 minutes.",
        "best_for": ("High", "Medium"),
    },
    {
        "name": "Diaphragmatic (belly) breathing",
        "steps": "One hand on the belly, inhale slowly through the nose letting the belly rise, then exhale gently. Continue for 3–5 minutes.",
        "best_for": ("Medium", "Low"),
    },
    {
        "name": "Alternate-nostril breathing",
        "steps": "Gently close the right nostril and inhale through the left; close the left and exhale through the right; inhale right, exhale left. Continue for 1–2 minutes.",
        "best_for": ("Low", "Medium"),
    },
]


def recommend_breathing(risk_level: str = "Low"):
    primary_pool = [e for e in BREATHING_EXERCISES if risk_level in e["best_for"]]
    if not primary_pool:
        primary_pool = BREATHING_EXERCISES[:1]
    primary = primary_pool[0]
    alternates = [e for e in BREATHING_EXERCISES if e["name"] != primary["name"]][:2]
    return primary, alternates
