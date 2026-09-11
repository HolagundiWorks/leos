# LEOS LAN Android client

This is a native Android client built with Android SDK views, the official
Material 3 component library, and the platform HTTP/JSON stack. It contains no
embedded web pages, custom UI framework, school business logic, or database:
the main LEOS desktop owns the TypeScript API and SQLite database.

The Android light/dark themes map Carbon colour tokens onto native Material 3
components, and the Purple/Blue/Cyan adaptive launcher icon follows the shared
identity in [`../docs/BRAND.md`](../docs/BRAND.md).

## Application structure

- `LeosApi`: LAN HTTP transport, pairing header, and authenticated requests.
- `ui/MainActivity`: screen coordination and Material component composition.
- Material top app bar: destination title and contextual back navigation.
- Material bottom navigation: Home, Students, Attendance, and More.
- More menu: faculty plans, LMS, tasks, reminders, timetable, and session
  actions. Administrative configuration remains desktop-only.

## Client hierarchy

- Host desktop: full configuration, administration, backup/import, hardware,
  Supabase, security, and operational access.
- LAN browser: operational viewing and major data entry; desktop-only settings
  and administration are removed and rejected server-side.
- Android: native connection/login/dashboard screens, student and schedule
  views, attendance entry, faculty planning, LMS spaces, tasks, and reminders.
  Other mutations are rejected server-side.

## Build

Open this directory in Android Studio with JDK 17 and Android SDK 35 installed,
then build the `app` debug or release variant. On first launch enter the LAN URL
shown by LEOS, enter its temporary pairing code, and sign in normally.

Cleartext HTTP is enabled only because the current LAN host is HTTP. Use this
client only on a trusted private network until LAN TLS is implemented.
