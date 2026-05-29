# API: caregivers

Reference for the caregivers surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /caregivers | List or read |
| POST   | /caregivers | Create |
| PATCH  | /caregivers/:id | Update |
| DELETE | /caregivers/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
