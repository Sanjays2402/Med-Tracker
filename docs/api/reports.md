# API: reports

Reference for the reports surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /reports | List or read |
| POST   | /reports | Create |
| PATCH  | /reports/:id | Update |
| DELETE | /reports/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
