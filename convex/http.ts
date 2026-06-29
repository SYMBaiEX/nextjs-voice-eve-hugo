import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Registers Convex Auth's HTTP routes (sign-in, token refresh, etc.).
auth.addHttpRoutes(http);

export default http;
