// Temporary redirect, so the address can still change without browsers caching the old target.
export default {
  fetch(request) {
    return Response.redirect(`https://satlab.steckley.xyz/peaker/${new URL(request.url).search}`, 302);
  },
};
