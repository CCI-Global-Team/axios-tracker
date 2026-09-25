// The Actions entry point, kept at this path because .github/workflows/axios-transition.yml runs it.
// The logic lives in packages/axios-transition, shared with the webhook receiver in apps/live; a
// relative import works because the workflow checks out this whole repo and the package has no
// dependencies to install.
import { run } from "../../packages/axios-transition/cli.mjs";

run();
