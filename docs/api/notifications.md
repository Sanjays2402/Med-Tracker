# API: notifications

Reference for the notifications surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /notifications | List or read |
| POST   | /notifications | Create |
| PATCH  | /notifications/:id | Update |
| DELETE | /notifications/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
