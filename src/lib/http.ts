import { ZodError } from "zod";

export function apiError(error: unknown, status = 400) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "Validation failed.",
        issues: error.flatten(),
      },
      { status: 422 },
    );
  }

  return Response.json(
    {
      error: error instanceof Error ? error.message : "Unexpected error.",
    },
    { status },
  );
}

