import { z } from "zod";

export const parseRequestJson = async <T>(req: Request, schema: z.ZodSchema<T>) => {
  const json = await req.json().catch(() => undefined);
  return schema.safeParse(json);
};

export const formatZodError = (error: z.ZodError) => {
  const flattened = error.flatten();
  return {
    message: "Invalid payload.",
    fields: flattened.fieldErrors,
    formErrors: flattened.formErrors,
  };
};
