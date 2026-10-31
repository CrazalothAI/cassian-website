// GitHub Pages uses this 404 fallback for case variants; an edge 301 is preferred.
if (/^\/zerotrace\/?$/i.test(location.pathname) && location.pathname !== '/ZeroTrace/') {
  location.replace('/ZeroTrace/' + location.search + location.hash);
}
