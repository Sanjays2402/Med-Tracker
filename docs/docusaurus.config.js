module.exports = {
  title: 'Med-Tracker',
  tagline: 'Open source medication adherence',
  url: 'https://docs.med-tracker.dev',
  baseUrl: '/',
  favicon: 'img/favicon.svg',
  organizationName: 'Sanjays2402',
  projectName: 'Med-Tracker',
  presets: [
    [
      'classic',
      {
        docs: { sidebarPath: require.resolve('./sidebars.js'), routeBasePath: '/' },
        blog: false,
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Med-Tracker',
      items: [
        { to: '/architecture/overview', label: 'Architecture', position: 'left' },
        { to: '/guides/quickstart', label: 'Guides', position: 'left' },
        { to: '/api/overview', label: 'API', position: 'left' },
        { href: 'https://github.com/Sanjays2402/Med-Tracker', label: 'GitHub', position: 'right' },
      ],
    },
  },
};
