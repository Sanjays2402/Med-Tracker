# API: medications

Reference for the medications surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /medications | List or read |
| POST   | /medications | Create |
| PATCH  | /medications/:id | Update |
| DELETE | /medications/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
