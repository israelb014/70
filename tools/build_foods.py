#!/usr/bin/env python3
"""
Build data/foods.json (+ data/foods-meta.json) for the "70" app.

Output (compact JSON, values per 100 g):
  [{ "n": name, "k": kcal, "p": protein g, "u": [{ "l": unit, "g": grams }], "a": [aliases], "s": source }]
  source: "label" (Israeli package labels) | "curated" (USDA-based list) | "tzameret" (Ministry of Health)

Usage (from the repository root):
  python3 tools/build_foods.py              # curated + label lists only (offline)
  python3 tools/build_foods.py --tzameret   # also download "צמרת" from data.gov.il and merge
                                            # (used by .github/workflows/update-foods.yml)

With --tzameret the script finds the dataset via the CKAN API, prints every table's column
headers, auto-detects the name / energy / protein columns (and a portion-weights table if
present), and merges. If anything essential is missing it exits with an error and does NOT
overwrite the existing files.
"""
import csv
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from food_data import LABEL, EXTRA, EXTRA2, EXTRA3, EXTRA4, EXTRA5  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'foods.json'
META = ROOT / 'data' / 'foods-meta.json'

# Base curated list (generic foods). Line format: name | kcal | protein | units | aliases
CURATED = """
# --- עוף והודו ---
חזה עוף צלוי|165|31|חזה שלם:170
חזה עוף מבושל|151|29.5|חזה שלם:170
חזה עוף נא|120|22.5|חזה שלם:200
חזה עוף בגריל|165|31|חזה שלם:170
פרגית צלויה|209|26|יחידה:90
פרגית נא|143|17.5|יחידה:110
שוק עוף צלוי עם עור|216|27|יחידה:110
שוק עוף צלוי בלי עור|172|28|יחידה:95
ירך עוף צלויה|229|25|יחידה:130
כנפיים צלויות|254|24|יחידה:35
עוף שלם צלוי עם עור|239|27|
עוף מבושל מהמרק|180|25|
כבד עוף מבושל|167|24.5|יחידה:30
לבבות עוף|185|26|
קורקבנים מבושלים|154|30|
שניצל עוף מטוגן|260|24|יחידה:120
שניצל עוף אפוי|210|24|יחידה:120
נאגטס עוף|296|15|יחידה:18
שווארמה עוף|215|24|מנה:150
קבב עוף|210|17|יחידה:60
קציצות עוף ברוטב|170|14|יחידה:60
חזה הודו נא|114|23.7|
חזה הודו צלוי|147|30|
שוק הודו צלוי|208|28|
שניצל הודו|240|23|יחידה:120
שווארמה הודו|230|22|מנה:150
פסטרמה הודו|105|18|פרוסה:15
נקניקיות עוף|240|11|יחידה:40
נקניקיות|280|11|יחידה:45
# --- בשר ---
בשר בקר טחון 5% מבושל|170|27|
בשר בקר טחון 15% מבושל|250|26|
בשר טחון נא 20%|254|17|
סטייק אנטריקוט צלוי|290|24|סטייק:250
סטייק סינטה צלוי|210|28|סטייק:250
פילה בקר צלוי|220|29|
צלי בקר|210|29|פרוסה:80
אסאדו|330|22|
המבורגר צלוי|250|25|קציצה:150
קציצות בשר ברוטב|200|14|יחידה:60
קבב בקר|270|18|יחידה:60
כבש צלוי|258|25.5|
צלעות כבש|294|25|
כבד בקר מטוגן|175|26.5|
לשון בקר|278|19|פרוסה:30
קורנדביף|250|18|פרוסה:20
פסטרמה בקר|150|21|פרוסה:15
סלמי|380|22|פרוסה:10
נקניק|310|12|פרוסה:15
מעורב ירושלמי|220|20|מנה:200
גולאש|130|12|כוס:240
צ'ולנט|160|9|כוס:240
סיגר בשר|300|10|יחידה:40
קובה מטוגנת|250|9|יחידה:60
קובה למרק|150|8|יחידה:70
# --- דגים ופירות ים ---
סלמון צלוי|206|22|נתח:150
סלמון נא|208|20|נתח:150
סלמון מעושן|117|18|פרוסה:20
טונה במים|116|26|קופסה מסוננת:120
טונה בשמן|198|29|קופסה מסוננת:120
טונה אדומה סטייק|130|29|נתח:150
אמנון צלוי|128|26|פילה:120
דניס צלוי|135|24|יחידה:200
לברק צלוי|130|23|יחידה:200
מושט צלוי|128|26|יחידה:200
בקלה צלויה|105|23|נתח:150
פילה הייק|90|18|פילה:120
מקרל|205|19|
סרדינים בשמן|208|25|קופסה:90
הרינג כבוש|260|14|חתיכה:30
מטיאס|200|17|חתיכה:30
דג חריימה|170|17|נתח:150
שניצל דג|230|13|יחידה:100
קציצות דגים|180|14|יחידה:60
גפילטע פיש|105|8|פרוסה:60
שרימפס|99|24|
קלמרי מטוגן|175|18|
סושי רול סלמון|150|6|יחידה:25
סושי רול טונה|145|7|יחידה:25
# --- ביצים ---
ביצה קשה|155|12.6|יחידה:55
ביצה נא|143|12.6|יחידה:55
ביצה מקושקשת|149|10|ביצה:60
חביתה|154|11|חביתה מ-2 ביצים:120
חביתת ירק|180|10|יחידה:120
ביצת עין|196|13.6|יחידה:46
חלבון ביצה|52|11|יחידה:33
חלמון|322|16|יחידה:17
שקשוקה|110|6.5|מנה:250
סלט ביצים|200|9|כף:30
# --- חלב ומוצריו ---
חלב 3%|60|3.3|כוס:240,כף:15
חלב 1%|42|3.4|כוס:240,כף:15
חלב סויה|43|3.3|כוס:240
משקה שקדים לא ממותק|15|0.5|כוס:240
משקה שיבולת שועל|48|1|כוס:240
שוקו|70|3.3|כוס:240,שקית:200
קוטג' 5%|96|11|גביע:250,כף:20
קוטג' 3%|80|11.5|גביע:250,כף:20
קוטג' 9%|125|10|גביע:250,כף:20
גבינה לבנה 5%|95|9|גביע:250,כף:20
גבינה לבנה 3%|75|9.5|גביע:250,כף:20
גבינה לבנה 9%|130|8.5|גביע:250,כף:20
גבינה לבנה 0%|56|10|גביע:250,כף:20
גבינה בולגרית 5%|125|16|קובייה:30
גבינה בולגרית 16%|240|16|קובייה:30
גבינת פטה 24%|265|14|קובייה:30
גבינה צהובה 28%|350|26|פרוסה:20
גבינה צהובה 15%|290|29|פרוסה:20
גבינה צהובה 9%|240|30|פרוסה:20
מוצרלה|280|22|כדור:125
מוצרלה מגורדת|300|23|כף:10
פרמזן|392|35.8|כף:5
גבינת שמנת 30%|300|6|כף:20
גבינת שמנת 5%|110|8|כף:20
ריקוטה|174|11|כף:25
לאבנה|160|7|כף:20
צפתית 5%|130|17|פרוסה:30
גבינת עיזים|300|20|פרוסה:20
חמאה|717|0.9|כף:14,כפית:5
שמנת מתוקה 32%|300|2.5|כף:15
שמנת חמוצה 15%|160|3|כף:15
שמנת לבישול 10%|120|3|כף:15
יוגורט 3%|61|3.5|גביע:200
יוגורט 1.5%|50|4|גביע:200
יוגורט יווני 0%|59|10|גביע:200
יוגורט יווני 2%|73|9.9|גביע:200
יוגורט יווני 10%|133|5.5|גביע:150
יוגורט פירות|95|3.5|גביע:150
יוגורט פרוביוטי|75|3.6|גביע:125
יוגורט חלבון|60|10|גביע:200
לבן 3%|60|3.3|גביע:200
אשל|60|3.3|גביע:200
מעדן חלבון|70|10|גביע:200
מעדן חלבון שוקולד|80|10|גביע:200
משקה חלבון|65|8|בקבוק:350
מילקי|160|3|גביע:125
פודינג שוקולד|125|3|גביע:125
פודינג וניל|115|3|גביע:125
גלידה|207|3.5|כדור:65
גלידת יוגורט|140|3|כדור:65
סחלב|100|3|כוס:240
אבקת חלבון|390|78|סקופ:30,כף:10
אבקת חלבון צמחי|380|75|סקופ:30
# --- לחמים ומאפים ---
לחם לבן|265|9|פרוסה:30
לחם אחיד|250|8.5|פרוסה:30
לחם מלא|247|13|פרוסה:30
לחם שיפון|259|8.5|פרוסה:30
לחם כוסמין|240|10|פרוסה:30
לחם קל|210|11|פרוסה:22
לחם מחמצת|270|9|פרוסה:40
לחם דגנים|255|11|פרוסה:30
חלה|290|8|פרוסה:40
באגט|270|9|רבע באגט:60
לחמניה|280|9|יחידה:60
לחמניה מלאה|260|10|יחידה:60
פיתה|275|9|יחידה:90
פיתה מלאה|250|10|יחידה:80
לאפה|275|9|יחידה:120
טורטייה|310|8|יחידה:45
טורטייה מלאה|290|9|יחידה:45
מצה|395|10|יחידה:30
מצה מלאה|360|12|יחידה:30
פריכיות אורז|387|8|יחידה:9
פריכיות תירס|380|8|יחידה:6
קרקר|430|9|יחידה:6
קרקר מלא|420|10|יחידה:6
בייגל|260|10|יחידה:100
בייגלה|380|10|חופן:30
טוסט לבן|265|9|פרוסה:25
קרואסון|406|8|יחידה:60
קרואסון שוקולד|420|7|יחידה:70
בורקס גבינה|330|9|יחידה:100
בורקס תפוחי אדמה|300|6|יחידה:100
בורקס פיצה|320|8|יחידה:100
ג'חנון|380|6|יחידה:150
מלאווח|370|6|יחידה:120
פיצה|266|11|משולש:120
פירורי לחם|395|13|כף:8
קורנפלקס|357|7.5|כוס:30
דגני בוקר מתוקים|390|7|כוס:30
כריות שוקולד|430|7|כוס:40
שיבולת שועל|389|16.9|כף:10,כוס:80
דייסת שיבולת שועל במים|71|2.5|כוס:235
גרנולה|470|10|כף:12,כוס:110
מוזלי|360|10|כוס:85
# --- דגנים, פסטה ותפוחי אדמה ---
אורז לבן מבושל|130|2.7|כוס:160,כף:15
אורז מלא מבושל|112|2.6|כוס:195,כף:15
אורז בסמטי מבושל|121|3.5|כוס:160,כף:15
אורז לבן לא מבושל|365|7|כוס:185
אורז עם ירקות|140|3|כוס:180
אורז עם עוף|170|11|מנה:300
פסטה מבושלת|158|5.8|כוס:140
פסטה מלאה מבושלת|149|6|כוס:140
פסטה יבשה|371|13|
פסטה ברוטב עגבניות|130|4.5|מנה:300
פסטה ברוטב שמנת|200|5|מנה:300
ספגטי בולונז|150|8|מנה:300
לזניה|150|8|מנה:250
מקרוני וגבינה|170|7|כוס:200
פתיתים מבושלים|160|5|כוס:160
פתיתים יבשים|365|12|
קוסקוס מבושל|112|3.8|כוס:160
קוסקוס עם מרק ירקות|90|3|מנה:400
בורגול מבושל|83|3|כוס:180
קינואה מבושלת|120|4.4|כוס:185
כוסמת מבושלת|92|3.4|כוס:170
פריקה מבושלת|120|4.5|כוס:170
פולנטה|70|1.6|כוס:240
נודלס מבושלים|138|4.5|כוס:160
אטריות אורז מבושלות|108|1.8|כוס:175
תפוח אדמה מבושל|87|1.9|יחידה:150
תפוח אדמה אפוי|93|2.5|יחידה:170
פירה|113|2|כוס:210
צ'יפס|312|3.4|מנה:120
צ'יפס בתנור|180|3|מנה:120
בטטה אפויה|90|2|יחידה:150
בטטה מבושלת|76|1.4|יחידה:150
תירס מבושל|96|3.4|קלח:100
תירס משומר|67|2.3|כף:15,כוס:165
לביבות תפוחי אדמה|270|5|יחידה:60
קוגל|200|4|פרוסה:100
קניידלך|200|5|יחידה:30
# --- קטניות וממרחים ---
חומוס ממרח|240|7.5|כף:20
חומוס מסעדה|260|9|מנה:300
חומוס פול|220|9|מנה:300
מסבחה|260|9|מנה:300
גרגרי חומוס מבושלים|164|8.9|כוס:165,כף:15
עדשים מבושלות|116|9|כוס:200
עדשים כתומות מבושלות|116|9|כוס:200
שעועית לבנה מבושלת|139|9.7|כוס:180
שעועית אדומה מבושלת|127|8.7|כוס:180
שעועית שחורה מבושלת|132|8.9|כוס:170
שעועית ברוטב עגבניות|90|5|כוס:250
אפונה ירוקה|81|5.4|כוס:145
פול מבושל|110|7.6|כוס:170
מג'דרה|150|5|כוס:200
פלאפל|333|13|כדור:17
פלאפל בפיתה|230|8|מנה:300
סביח|210|6|מנה:350
טופו|76|8|
טופו מוקשה|145|17|
אדממה|121|11.9|כוס:155
פולי סויה מבושלים|172|18|כוס:170
טחינה גולמית|595|17|כף:15,כפית:5
טחינה מוכנה|300|8.5|כף:20
חלבה|470|12|פרוסה:30
בוטנים קלויים|585|24|חופן:30,כף:10
חמאת בוטנים|588|25|כף:16,כפית:5
המבורגר צמחי|220|18|יחידה:115
שניצל תירס|200|4|יחידה:60
שניצל צמחי|230|15|יחידה:100
# --- ירקות ---
עגבנייה|18|0.9|יחידה:120
עגבניות שרי|18|0.9|יחידה:15,כוס:150
מלפפון|15|0.7|יחידה:100
גמבה אדומה|31|1|יחידה:150
פלפל ירוק|20|0.9|יחידה:120
פלפל צהוב|27|1|יחידה:150
פלפל חריף|40|1.9|יחידה:15
גזר|41|0.9|יחידה:70
גזר מבושל|35|0.8|כוס:155
חסה|15|1.4|כוס:50
חסה רומית|17|1.2|עלה:10
רוקט|25|2.6|כוס:20
כרוב|25|1.3|כוס:90
כרוב סגול|31|1.4|כוס:90
ברוקולי|34|2.8|כוס:90
ברוקולי מבושל|35|2.4|כוס:155
כרובית|25|1.9|כוס:100
כרובית מבושלת|23|1.8|כוס:125
כרובית מטוגנת|160|3|כוס:100
קישוא|17|1.2|יחידה:150
קישוא מבושל|17|1.1|יחידה:150
חציל|25|1|יחידה:300
חציל קלוי|35|0.8|יחידה:250
חציל מטוגן|180|1.5|פרוסה:30
סלט חצילים במיונז|220|1.5|כף:25
בצל|40|1.1|יחידה:110
בצל מטוגן|170|1.5|כף:15
בצל ירוק|32|1.8|גבעול:15
שום|149|6.4|שן:4
תרד|23|2.9|כוס:30
תרד מבושל|23|3|כוס:180
פטריות|22|3.1|כוס:70
פטריות מוקפצות|50|3.5|כוס:110
סלק מבושל|44|1.7|יחידה:80
צנונית|16|0.7|יחידה:5
סלרי|16|0.7|גבעול:40
שעועית ירוקה|31|1.8|כוס:100
אספרגוס|20|2.2|יחידה:16
דלעת|26|1|כוס:115
קולורבי|27|1.7|יחידה:150
פטרוזיליה|36|3|כף:4
כוסברה|23|2.1|כף:2
שמיר|43|3.5|כף:2
נענע|44|3.3|כף:2
ארטישוק|47|3.3|יחידה:120
אבוקדו|160|2|יחידה:150,כף:15
זיתים ירוקים|145|1|יחידה:4
זיתים שחורים|115|0.8|יחידה:4
מלפפון חמוץ|12|0.5|יחידה:60
כרוב כבוש|19|0.9|כוס:140
סלט ישראלי|25|1|כוס:150
סלט ירקות עם שמן|70|1|כוס:150
סלט קולסלאו|150|1|כף:25
סלט טבולה|120|2.5|כוס:160
סלט קינואה|140|4|כוס:180
מטבוחה|110|1.5|כף:20
סחוג|120|2|כפית:5
עמבה|50|0.5|כף:15
ירקות מוקפצים|60|2|כוס:150
ירקות קפואים מעורבים|65|3.3|כוס:135
פלפל ממולא|120|5|יחידה:250
עלי גפן ממולאים|180|3|יחידה:25
מוסקה|140|7|מנה:300
פשטידת ירקות|180|7|פרוסה:120
# --- פירות ---
תפוח|52|0.3|יחידה:180
בננה|89|1.1|יחידה:120
תפוז|47|0.9|יחידה:150
קלמנטינה|53|0.8|יחידה:75
אשכולית|42|0.8|חצי:125
פומלה|38|0.8|פלח:30
אגס|57|0.4|יחידה:180
ענבים|69|0.7|כוס:150
אבטיח|30|0.6|פרוסה:300,כוס:150
מלון|34|0.8|פרוסה:150,כוס:160
אפרסק|39|0.9|יחידה:150
נקטרינה|44|1.1|יחידה:140
שזיף|46|0.7|יחידה:65
משמש|48|1.4|יחידה:35
דובדבנים|63|1.1|כוס:140
תותים|32|0.7|כוס:150,יחידה:12
אוכמניות|57|0.7|כוס:150
פטל|52|1.2|כוס:125
מנגו|60|0.8|יחידה:200,כוס:165
אננס|50|0.5|כוס:165,פרוסה:85
קיווי|61|1.1|יחידה:75
רימון|83|1.7|יחידה:175,כוס:175
תאנה|74|0.8|יחידה:50
תמר מג'הול|277|1.8|יחידה:24
תמר דקל נור|282|2.5|יחידה:8
אפרסמון|70|0.6|יחידה:170
פפאיה|43|0.5|כוס:145
גויאבה|68|2.6|יחידה:55
ליצ'י|66|0.8|יחידה:10
לימון|29|1.1|יחידה:60
פסיפלורה|97|2.2|יחידה:18
שסק|47|0.4|יחידה:15
אבוקדו מעוך|160|2|כף:15
צימוקים|299|3.1|כף:10,חופן:30
משמש מיובש|241|3.4|יחידה:8
שזיף מיובש|240|2.2|יחידה:9
חמוציות מיובשות|308|0.2|כף:10
תאנה מיובשת|249|3.3|יחידה:20
מנגו מיובש|320|2.5|פרוסה:10
סלט פירות|50|0.6|כוס:180
רסק תפוחים|68|0.2|גביע:100
# --- אגוזים וזרעים ---
שקדים|579|21|חופן:30,יחידה:1.2
אגוזי מלך|654|15|חופן:30
קשיו|553|18|חופן:30
פיסטוקים קלויים|572|21|חופן:30
אגוזי לוז|628|15|חופן:30
פקאן|691|9|חופן:30
אגוזי ברזיל|659|14|יחידה:5
מקדמיה|718|8|חופן:30
גרעיני חמנייה|582|19|חופן:30,כף:9
גרעינים שחורים|557|28|חופן:30
גרעיני דלעת|559|30|חופן:30,כף:9
זרעי צ'יה|486|17|כף:12
זרעי פשתן|534|18|כף:10
שומשום|573|18|כף:9
מיקס אגוזים|607|20|חופן:30
חמאת שקדים|614|21|כף:16
# --- שמנים, רטבים וממתיקים ---
שמן זית|884|0|כף:13,כפית:4.5
שמן קנולה|884|0|כף:14,כפית:4.5
שמן חמניות|884|0|כף:14,כפית:4.5
שמן קוקוס|862|0|כף:13
מיונז|680|1|כף:14,כפית:5
מיונז לייט|300|1|כף:15
קטשופ|112|1|כף:17
חרדל|66|4.4|כפית:5
רוטב סויה|53|8|כף:16
רוטב צ'ילי מתוק|210|0.5|כף:18
רוטב ברביקיו|170|0.8|כף:17
רוטב פסטו|430|5|כף:15
רוטב עגבניות לפסטה|50|1.5|כוס:250,כף:15
רסק עגבניות|82|4.3|כף:16
ויניגרט|290|0|כף:15
רוטב אלף האיים|380|1|כף:15
רוטב שום|450|1|כף:15
רוטב טריאקי|90|6|כף:18
דבש|304|0.3|כף:21,כפית:7
סילאן|300|1|כף:20,כפית:7
סוכר|387|0|כף:12,כפית:4
ריבה|250|0.4|כף:20,כפית:7
ממרח שוקולד|539|6.3|כף:19,כפית:7
ממרח תמרים|290|2|כף:20
סירופ מייפל|260|0|כף:20
זעתר|300|10|כף:5
# --- חטיפים ומתוקים ---
במבה|534|16|שקית קטנה:25,שקית:80
במבה נוגט|540|10|שקית:60
ביסלי גריל|490|10|שקית קטנה:35,שקית:70
ביסלי בצל|490|10|שקית קטנה:35,שקית:70
תפוצ'יפס|536|7|שקית קטנה:25,שקית:50
דוריטוס|500|7|שקית:70
צ'יטוס|560|6|שקית:50
פופקורן|387|13|כוס:8
פופקורן במיקרו|480|8|שקית:85
שוקולד חלב|535|7.6|קובייה:5,טבלה:100
שוקולד מריר 70%|598|7.8|קובייה:5,טבלה:100
שוקולד לבן|539|6|קובייה:5,טבלה:100
פסק זמן|530|7|יחידה:45
קיט קט|518|6.5|יחידה:41
טוויקס|495|4.5|יחידה:50
מרס|450|4|יחידה:51
סניקרס|488|8.5|יחידה:50
חטיף גרנולה|430|7|יחידה:30
חטיף חלבון|360|33|יחידה:60
חטיף פירות|330|1|יחידה:20
עוגיות שוקולד צ'יפס|490|5|יחידה:12
עוגיות חמאה|480|6|יחידה:8
עוגיות שיבולת שועל|450|6|יחידה:15
ופלים|520|5|יחידה:10
עוגת שמרים|380|7|פרוסה:60
עוגת שוקולד|370|5|פרוסה:80
עוגת גבינה|320|6|פרוסה:100
עוגה בחושה|380|5|פרוסה:60
סופגנייה|400|6|יחידה:80
רוגלך|430|6|יחידה:25
קרמבו|420|4|יחידה:25
סוכריות גומי|343|6|חופן:30
מרשמלו|318|1.8|יחידה:7
ארטיק קרח|80|0|יחידה:70
ארטיק שמנת שוקולד|300|3.5|יחידה:70
# --- שתייה ---
מים|0|0|כוס:240
סודה|0|0|כוס:240
קפה שחור|2|0.1|כוס:240
אספרסו|9|0.1|שוט:30
קפה הפוך|50|2.7|כוס:240
קפוצ'ינו|50|2.7|כוס:240
קפה הפוך בחלב 1%|38|2.8|כוס:240
קפה בחלב סויה|35|2.5|כוס:240
אייס קפה|80|1.8|כוס:300
נס קפה עם חלב|30|1.5|כוס:240
תה|1|0|כוס:240
תה עם סוכר|16|0|כוס:240
קולה|42|0|כוס:240,פחית:330
קולה זירו|0|0|כוס:240,פחית:330
ספרייט|39|0|כוס:240,פחית:330
מיץ תפוזים|45|0.7|כוס:240
מיץ תפוחים|46|0.1|כוס:240
מיץ ענבים|60|0.4|כוס:240
מיץ גזר|40|0.9|כוס:240
לימונדה|40|0|כוס:240
פטל מהול|35|0|כוס:240
משקה אנרגיה|45|0|פחית:250
שייק פירות|60|0.7|כוס:300
קומבוצ'ה|15|0|בקבוק:330
בירה|43|0.5|בקבוק:330
יין אדום|85|0.1|כוס:150
יין לבן|82|0.1|כוס:150
וודקה|231|0|כוסית:40
ערק|230|0|כוסית:40
ויסקי|250|0|כוסית:40
# --- מנות ביתיות ומרקים ---
שניצל|260|24|יחידה:120
קציצות|200|14|יחידה:60
עוף בתנור עם תפוחי אדמה|160|14|מנה:350
מוקפץ עוף ונודלס|150|9|מנה:350
סלט עוף|180|15|מנה:250
פשטידת גבינות|220|11|פרוסה:120
מרק עוף|35|3|כוס:240
מרק עוף עם ירקות|40|3|כוס:240
מרק עוף עם קניידלך|60|4|כוס:250
מרק ירקות|35|1|כוס:240
מרק עגבניות|40|1|כוס:240
מרק כתום|45|1|כוס:240
מרק אפונה|75|5|כוס:240
מרק עדשים|60|3.5|כוס:240
מרק תימני|70|7|כוס:250
המבורגר בלחמנייה|250|13|יחידה:250
טוסט גבינה|300|13|יחידה:150
כריך טונה|210|11|יחידה:200
כריך ביצה|220|10|יחידה:180
סלט טונה|190|15|כף:30
"""


# ---------------------------------------------------------------- parsing helpers

def parse_units(spec):
    units = []
    for part in filter(None, (s.strip() for s in (spec or '').split(','))):
        label, grams = part.rsplit(':', 1)
        units.append({'l': label.strip(), 'g': num(grams)})
    return units


def num(v):
    """Compact number: drop .0, keep one decimal."""
    v = round(float(v), 1)
    return int(v) if v == int(v) else v


def parse_block(text, source):
    foods = []
    for line in text.strip().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = (line.split('|') + ['', ''])[:5]
        name, kcal, protein, units, aliases = (p.strip() for p in parts)
        f = {'n': name, 'k': num(kcal), 'p': num(protein), 'u': parse_units(units), 's': source}
        al = [a.strip() for a in aliases.split(',') if a.strip() and a.strip() != name]
        if al:
            f['a'] = al
        foods.append(f)
    return foods


FINALS = str.maketrans({'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'})


def normalize(s):
    """Mirror of normalizeHe() in js/foods.js."""
    s = re.sub(r'[\u0591-\u05C7]', '', str(s or '').lower()).translate(FINALS)
    s = re.sub(r'["\'`׳״\u2018\u2019\u201C\u201D]', '', s)
    s = re.sub(r'[-–_,.()/]', ' ', s)
    s = s.replace('וו', 'ו').replace('יי', 'י')
    return re.sub(r'\s+', ' ', s).strip()


def dedupe(foods):
    seen, out = set(), []
    for f in foods:
        key = normalize(f['n'])
        if key in seen:
            continue
        assert 0 <= f['k'] <= 900 and 0 <= f['p'] <= 100, f
        seen.add(key)
        out.append(f)
    return out


def local_foods():
    # Label entries first: a branded label entry wins over a curated one with the same name.
    return dedupe(parse_block(LABEL, 'label') + parse_block(CURATED, 'curated') + parse_block(EXTRA, 'curated')
                  + parse_block(EXTRA2, 'curated') + parse_block(EXTRA3, 'curated') + parse_block(EXTRA4, 'curated') + parse_block(EXTRA5, 'curated'))


# ---------------------------------------------------------------- Tzameret (data.gov.il)

CKAN = 'https://data.gov.il/api/3/action/package_search?rows=50&q='
QUERIES = ['צמרת', 'nutrition', 'מזון']


def fail(msg, found=None):
    print('\n::error::' + msg)
    if found:
        print('What was found:')
        for line in found:
            print('  - ' + line)
    print('foods.json was NOT changed.')
    sys.exit(1)


def http_get(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': 'seventy-food-builder/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def find_resources():
    found_log, resources = [], []
    for q in QUERIES:
        try:
            data = json.loads(http_get(CKAN + urllib.parse.quote(q)))
        except Exception as e:  # noqa: BLE001
            found_log.append(f'query "{q}": request failed ({e})')
            continue
        results = data.get('result', {}).get('results', [])
        found_log.append(f'query "{q}": {len(results)} datasets')
        for pkg in results:
            text = ' '.join(str(pkg.get(k, '')) for k in ('title', 'name', 'notes')).lower()
            relevant = any(w in text for w in ('צמרת', 'tzameret', 'מרכיבי מזון', 'הרכב מזון', 'nutrient', 'nutrition'))
            fmts = [str(r.get('format', '')).upper() for r in pkg.get('resources', [])]
            found_log.append(f'  {"*" if relevant else " "} {pkg.get("title")} [{pkg.get("name")}] formats={fmts}')
            if not relevant:
                continue
            for r in pkg.get('resources', []):
                fmt = str(r.get('format', '')).upper()
                url = r.get('url', '')
                if fmt in ('CSV', 'XLSX', 'XLS') or url.lower().endswith(('.csv', '.xlsx', '.xls')):
                    resources.append({'pkg': pkg.get('title'), 'name': r.get('name'), 'fmt': fmt, 'url': url})
        if resources:
            break
    return resources, found_log


def read_table(raw, fmt, url):
    """Return list of tables; each table = (headers, rows as dicts)."""
    tables = []
    if fmt in ('XLSX', 'XLS') or url.lower().endswith(('.xlsx', '.xls')):
        import openpyxl  # installed by the workflow
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        for ws in wb.worksheets:
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            headers = [str(h).strip() if h is not None else '' for h in rows[0]]
            tables.append((headers, [dict(zip(headers, r)) for r in rows[1:]]))
    else:
        for enc in ('utf-8-sig', 'cp1255', 'latin-1'):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        reader = csv.DictReader(io.StringIO(text))
        headers = [h.strip() for h in (reader.fieldnames or [])]
        tables.append((headers, [{(k or '').strip(): v for k, v in row.items()} for row in reader]))
    return tables


def pick_col(headers, candidates, avoid=()):
    low = {h: h.lower() for h in headers}
    for cand in candidates:
        for h, l in low.items():
            if l == cand:
                return h
    for cand in candidates:
        for h, l in low.items():
            if cand in l and not any(a in l for a in avoid):
                return h
    return None


def to_float(v):
    try:
        return float(str(v).replace(',', '.').strip())
    except (TypeError, ValueError):
        return None


def tzameret_foods():
    resources, found_log = find_resources()
    if not resources:
        fail('Could not find the Tzameret dataset (CSV/XLSX) on data.gov.il.', found_log)
    print('Resources:')
    for r in resources:
        print(f'  {r["pkg"]} / {r["name"]} ({r["fmt"]}) {r["url"]}')

    main, units_tables, seen_headers = None, [], []
    for r in resources:
        try:
            raw = http_get(r['url'], timeout=300)
            tables = read_table(raw, r['fmt'], r['url'])
        except Exception as e:  # noqa: BLE001
            seen_headers.append(f'{r["name"]}: download/parse failed ({e})')
            continue
        for headers, rows in tables:
            print(f'\nTable "{r["name"]}" — {len(rows)} rows. Columns:')
            print('  ' + ' | '.join(headers))
            seen_headers.append(f'{r["name"]} ({len(rows)} rows): {", ".join(headers)}')
            name_c = pick_col(headers, ['shmmitzrach', 'hebrew_name', 'שם מצרך', 'שם המצרך', 'שם', 'name'], avoid=('english', 'אנגלית', 'mida', 'מידה'))
            energy_c = pick_col(headers, ['food_energy', 'energy_kcal', 'energy', 'אנרגיה', 'קלוריות', 'kcal'])
            protein_c = pick_col(headers, ['protein', 'חלבון', 'חלבונים'])
            weight_c = pick_col(headers, ['mishkal', 'weight', 'משקל', 'grams', 'גרם'])
            unit_c = pick_col(headers, ['shmmida', 'mida', 'unit_name', 'מידה', 'יחידה', 'portion'])
            code_c = pick_col(headers, ['smlmitzrach', 'mmitzrach', 'code', 'קוד מצרך', 'קוד'])
            if name_c and energy_c and protein_c and (main is None or len(rows) > len(main[1])):
                main = (headers, rows, name_c, energy_c, protein_c, code_c)
            elif unit_c and weight_c and code_c:
                units_tables.append((rows, code_c, unit_c, weight_c))

    if not main:
        fail('Found tables, but none with Hebrew name + energy + protein columns.', seen_headers)
    headers, rows, name_c, energy_c, protein_c, code_c = main
    kj = 'kj' in energy_c.lower() or "ג'ול" in energy_c or 'ג׳ול' in energy_c
    print(f'\nUsing columns: name="{name_c}" energy="{energy_c}"{" (kJ → kcal)" if kj else ""} protein="{protein_c}" code="{code_c}"')

    units_by_code = {}
    for urows, ucode, ulabel, uweight in units_tables:
        print(f'Units table: code="{ucode}" label="{ulabel}" grams="{uweight}" ({len(urows)} rows)')
        for row in urows:
            g = to_float(row.get(uweight))
            label = str(row.get(ulabel) or '').strip()
            if g and g > 0 and label:
                units_by_code.setdefault(str(row.get(ucode)).strip(), []).append({'l': label, 'g': num(g)})

    foods = []
    for row in rows:
        name = str(row.get(name_c) or '').strip()
        kcal, protein = to_float(row.get(energy_c)), to_float(row.get(protein_c))
        if not name or kcal is None or protein is None:
            continue
        if kj:
            kcal /= 4.184
        if not (0 <= kcal <= 900 and 0 <= protein <= 100):
            continue
        code = str(row.get(code_c)).strip() if code_c else None
        foods.append({'n': name, 'k': num(kcal), 'p': num(protein), 'u': units_by_code.get(code, [])[:8], 's': 'tzameret'})
    if len(foods) < 300:
        fail(f'Only {len(foods)} usable Tzameret rows were parsed (expected hundreds).', seen_headers)
    print(f'Parsed {len(foods)} Tzameret foods.')
    return foods


def merge(local, tz):
    """Label entries always win; Tzameret replaces curated generic entries with the same normalized name."""
    by_key = {normalize(f['n']): f for f in tz}
    out, used = [], set()
    for f in local:
        key = normalize(f['n'])
        t = by_key.get(key)
        if f['s'] == 'curated' and t:
            merged = dict(t)
            merged['u'] = t['u'] or f['u']
            if f.get('a'):
                merged['a'] = f['a']
            out.append(merged)
            used.add(key)
        else:
            out.append(f)
            used.add(key)
    for key, t in by_key.items():
        if key not in used:
            out.append(t)
            used.add(key)
    return out


# ---------------------------------------------------------------- main

def main():
    foods = local_foods()
    if '--tzameret' in sys.argv[1:]:
        foods = dedupe(merge(foods, tzameret_foods()))
    counts = {}
    for f in foods:
        counts[f['s']] = counts.get(f['s'], 0) + 1
    OUT.write_text(json.dumps(foods, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    now = datetime.now(timezone.utc)
    META.write_text(json.dumps({
        'version': now.strftime('%Y%m%d%H%M'),
        'builtAt': now.isoformat(timespec='seconds'),
        'total': len(foods),
        'counts': counts,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {len(foods)} foods -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB) counts={counts}')


if __name__ == '__main__':
    main()
