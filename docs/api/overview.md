# API: overview

Reference for the overview surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /overview | List or read |
| POST   | /overview | Create |
| PATCH  | /overview/:id | Update |
| DELETE | /overview/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
