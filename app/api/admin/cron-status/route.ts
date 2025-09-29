import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

export const runtime = 'nodejs'

const execAsync = promisify(exec)

// GET /api/admin/cron-status - Check if cron job is configured
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Checking cron job status...')

    // Check if cron job is configured
    let cronConfigured = false
    let cronEntries = []

    try {
      const { stdout } = await execAsync('crontab -l 2>/dev/null || true')
      const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('#'))

      cronEntries = lines.map(line => line.trim())

      // Look for our pending payments cron job
      cronConfigured = lines.some(line =>
        line.includes('check-pending-payments-cron.js') ||
        line.includes('check-pending-payments')
      )

    } catch (error) {
      console.warn('Could not check crontab:', error)
    }

    // Check if the script file exists
    const fs = require('fs')
    const path = require('path')
    const scriptPath = path.join(process.cwd(), 'scripts', 'check-pending-payments-cron.js')
    const scriptExists = fs.existsSync(scriptPath)

    // Get recent logs (if any)
    const recentRuns = await getRecentCronRuns()

    return NextResponse.json({
      success: true,
      cronConfigured,
      scriptExists,
      scriptPath,
      cronEntries,
      recentRuns,
      recommendations: {
        setupInstructions: cronConfigured ? null : [
          '1. Make the script executable: chmod +x scripts/check-pending-payments-cron.js',
          '2. Add to crontab: crontab -e',
          '3. Add this line: 0 */6 * * * cd ' + process.cwd() + ' && node scripts/check-pending-payments-cron.js >> /var/log/pending-payments-cron.log 2>&1',
          '4. Or for every 4 hours: 0 */4 * * * cd ' + process.cwd() + ' && node scripts/check-pending-payments-cron.js >> /var/log/pending-payments-cron.log 2>&1'
        ],
        manualTestCommand: 'node scripts/check-pending-payments-cron.js',
        logFile: '/var/log/pending-payments-cron.log'
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Error checking cron status:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST /api/admin/cron-status - Install or update cron job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, interval = 6 } = body // interval in hours

    console.log(`🔧 Cron job ${action} requested (interval: ${interval}h)...`)

    if (action === 'install') {
      // Create the cron entry
      const cronExpression = `0 */${interval} * * *`
      const projectPath = process.cwd()
      const cronLine = `${cronExpression} cd ${projectPath} && node scripts/check-pending-payments-cron.js >> /var/log/pending-payments-cron.log 2>&1`

      // Get current crontab
      let currentCrontab = ''
      try {
        const { stdout } = await execAsync('crontab -l 2>/dev/null || true')
        currentCrontab = stdout
      } catch (error) {
        console.warn('No existing crontab found, creating new one')
      }

      // Check if our job already exists
      if (currentCrontab.includes('check-pending-payments-cron.js')) {
        return NextResponse.json({
          success: false,
          message: 'Cron job already exists. Use "update" action to modify it.',
          existingEntry: currentCrontab.split('\n').find(line =>
            line.includes('check-pending-payments-cron.js')
          )
        }, { status: 400 })
      }

      // Add our job to crontab
      const newCrontab = currentCrontab + (currentCrontab.endsWith('\n') ? '' : '\n') + cronLine + '\n'

      // Install new crontab
      await execAsync(`echo "${newCrontab}" | crontab -`)

      return NextResponse.json({
        success: true,
        action: 'install',
        message: `Cron job installed successfully (every ${interval} hours)`,
        cronLine,
        interval: `${interval}h`,
        nextRun: getNextCronRun(interval),
        timestamp: new Date().toISOString()
      })

    } else if (action === 'remove') {
      // Get current crontab and remove our job
      const { stdout } = await execAsync('crontab -l 2>/dev/null || true')
      const lines = stdout.split('\n').filter(line =>
        line.trim() && !line.includes('check-pending-payments-cron.js')
      )

      const newCrontab = lines.join('\n') + (lines.length > 0 ? '\n' : '')

      // Install updated crontab
      await execAsync(`echo "${newCrontab}" | crontab -`)

      return NextResponse.json({
        success: true,
        action: 'remove',
        message: 'Cron job removed successfully',
        timestamp: new Date().toISOString()
      })

    } else {
      return NextResponse.json({
        success: false,
        message: 'Invalid action. Use "install" or "remove"'
      }, { status: 400 })
    }

  } catch (error) {
    console.error('❌ Error managing cron job:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// Helper function to get recent cron runs from logs
async function getRecentCronRuns(): Promise<any[]> {
  try {
    // This would read from log files, but for now return empty array
    // You could implement log parsing here if needed
    return []
  } catch (error) {
    return []
  }
}

// Helper function to calculate next cron run
function getNextCronRun(intervalHours: number): string {
  const now = new Date()
  const nextRun = new Date(now)

  // Find next interval boundary
  const currentHour = now.getHours()
  const nextHour = Math.ceil(currentHour / intervalHours) * intervalHours

  if (nextHour >= 24) {
    nextRun.setDate(nextRun.getDate() + 1)
    nextRun.setHours(nextHour - 24, 0, 0, 0)
  } else {
    nextRun.setHours(nextHour, 0, 0, 0)
  }

  return nextRun.toISOString()
}