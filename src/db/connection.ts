import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
}

const sql = postgres(connectionString, {
    ssl: {
        rejectUnauthorized: false // Required for Supabase connection
    },
    max: 20, // Connection pool size
    idle_timeout: 30, // Timeout in seconds
    connect_timeout: 10,
    connection: {
        application_name: 'lockd.app'
    }
})

export default sql
