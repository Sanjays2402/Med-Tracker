# API: schedules

Reference for the schedules surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /schedules | List or read |
| POST   | /schedules | Create |
| PATCH  | /schedules/:id | Update |
| DELETE | /schedules/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
