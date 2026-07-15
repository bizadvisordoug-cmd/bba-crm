import { Suspense } from 'react'
import { UnsubscribeClient } from '@/components/unsubscribe-client'

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UnsubscribeClient />
    </Suspense>
  )
}
