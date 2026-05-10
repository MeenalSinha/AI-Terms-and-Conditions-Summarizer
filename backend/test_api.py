import asyncio
import httpx

async def test():
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get('http://localhost:8000/api/health')
        d = r.json()
        print('=== HEALTH CHECK ===')
        print('Status:', d['status'])
        print('Claude available:', d['engines']['claude'])
        print('Mistral local:', d['engines']['mistral_local'])
        print('Rule-based:', d['engines']['rule_based'])
        print('CUDA:', d['engines']['cuda_available'])
        print('GPU:', d['engines']['cuda_device'])
        print()

        r2 = await c.post('http://localhost:8000/api/analyze/text', json={
            'text': (
                '1. Data Sharing: We may share your personal information with third-party advertisers. '
                '2. Arbitration: You waive your right to jury trial and class action lawsuits. '
                '3. Account Termination: We may suspend your account at any time without notice. '
                '4. Privacy Rights: You may request deletion of your data under CCPA.'
            ),
            'model_type': 'rule_based'
        })
        d2 = r2.json()
        print('=== RULE-BASED ANALYSIS ===')
        print('HTTP Status:', r2.status_code)
        print('Clauses analyzed:', d2['summary']['total_clauses'])
        print('Overall score:', d2['overall_risk_score'])
        print('Risk level:', d2['summary']['risk_level'])
        print('Red flags:', d2['summary']['red_flag_count'])
        print()
        for cl in d2['clauses']:
            print(f"  [{cl['risk_level']:8}] {cl['category']} | {cl['user_impact'][:70]}")
        print()

        r3 = await c.post('http://localhost:8000/api/chat', json={
            'message': 'Can they sell my data?',
            'document_context': 'We share personal information with third-party advertisers.'
        })
        d3 = r3.json()
        print('=== CHAT ===')
        print('HTTP Status:', r3.status_code)
        print('Response:', d3['response'][:100])
        print('Confidence:', d3['confidence'])

asyncio.run(test())
