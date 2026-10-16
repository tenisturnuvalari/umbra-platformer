/** "three" specifier'ını kafaüstü stub'a yönlendirir (yalnızca test). */
export async function resolve(specifier, context, next) {
  if (specifier === "three") {
    return {
      shortCircuit: true,
      url: new URL("./three-stub.mjs", import.meta.url).href,
      format: "module",
    };
  }
  return next(specifier, context);
}
