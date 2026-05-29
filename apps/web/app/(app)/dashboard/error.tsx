"use client";
export default function Error({{ error }}: {{ error: Error }}) {{
  return <div className="p-8 text-danger-500">Something went wrong: {{error.message}}</div>;
}}
