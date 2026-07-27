export default function ConfigurationError({ message }) {
  return <main className="admin-boot admin-boot--error">
    <h1>Admin panel configuration error</h1>
    <p>{message}</p>
    <small>Set the required Netlify environment variable and redeploy this site.</small>
  </main>
}
