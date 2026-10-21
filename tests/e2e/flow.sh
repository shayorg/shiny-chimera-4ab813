#!/usr/bin/env bash
# End-to-end checkout test against `netlify dev` + tests/e2e/mock-rpc.mjs. No real funds.
# Usage: ADMIN_TOKEN=... bash tests/e2e/flow.sh [base_url]
set -u
B=${1:-http://localhost:8889}; RPC=http://127.0.0.1:8545
WALLET=0x7E308f09EAAC6129685f6009F0CF84643B40CFED
pass=0; fail=0
check(){ if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }
j(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(eval("o."+process.argv[1])??"")})' "$1"; }
hash(){ echo 0x$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'); }
order(){ curl -s -X POST $B/api/orders -H 'content-type: application/json' -d "{\"productId\":\"$1\",\"email\":\"buyer@example.org\"}"; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

printf 'TEST PRODUCT FILE - prompts pack\n' > /tmp/test-product.txt
check "admin upload rejected without token" "$(code -X PUT $B/api/admin/products/prompts-20 --data-binary @/tmp/test-product.txt)" 401
check "admin upload" "$(code -X PUT $B/api/admin/products/prompts-20 -H "authorization: Bearer $ADMIN_TOKEN" -H 'x-filename: prompts.txt' -H 'content-type: text/plain' --data-binary @/tmp/test-product.txt)" 201
check "product purchasable after upload" "$(curl -s $B/api/config | j 'products[0].purchasable')" true
check "product without file stays closed" "$(order mini-course | j 'error.code')" checkout_unavailable
check "invalid email rejected" "$(code -X POST $B/api/orders -H 'content-type: application/json' -d '{"productId":"prompts-20","email":"nope"}')" 400

O=$(order prompts-20); ID=$(echo "$O" | j order.id); KEY=$(echo "$O" | j accessKey); UNITS=$(echo "$O" | j order.amountUnits)
echo "order $ID amount $(echo "$O" | j order.amount) USDC"
check "unique amount above list price" "$([ "$UNITS" -gt 5000000 ] && [ "$UNITS" -lt 5010000 ] && echo y)" y
O2=$(order prompts-20); ID2=$(echo "$O2" | j order.id); KEY2=$(echo "$O2" | j accessKey); UNITS2=$(echo "$O2" | j order.amountUnits)
check "concurrent orders get different amounts" "$([ "$UNITS" != "$UNITS2" ] && echo y)" y

check "status requires access key" "$(code $B/api/orders/$ID)" 404
check "status with wrong key" "$(code -H 'x-order-key: wrong' $B/api/orders/$ID)" 404
check "status pending" "$(curl -s -H "x-order-key: $KEY" $B/api/orders/$ID | j order.status)" pending

V(){ curl -s -X POST $B/api/orders/$1/verify -H 'content-type: application/json' -H "x-order-key: $2" -d "{\"txHash\":\"$3\"}"; }
H=$(hash); check "unknown tx is retryable" "$(V $ID $KEY $H | j error.code)" not_found
H=$(hash); curl -s -X POST $RPC/__tx -d "{\"hash\":\"$H\",\"to\":\"$WALLET\",\"value\":\"5000000\"}" >/dev/null
check "list price without suffix rejected" "$(V $ID $KEY $H | j error.code)" amount_mismatch
H=$(hash); curl -s -X POST $RPC/__tx -d "{\"hash\":\"$H\",\"to\":\"$WALLET\",\"value\":\"$UNITS\",\"token\":\"0x9999999999999999999999999999999999999999\"}" >/dev/null
check "fake token rejected" "$(V $ID $KEY $H | j error.code)" no_matching_transfer
H=$(hash); curl -s -X POST $RPC/__tx -d "{\"hash\":\"$H\",\"to\":\"0x2222222222222222222222222222222222222222\",\"value\":\"$UNITS\"}" >/dev/null
check "wrong recipient rejected" "$(V $ID $KEY $H | j error.code)" no_matching_transfer
H=$(hash); curl -s -X POST $RPC/__tx -d "{\"hash\":\"$H\",\"to\":\"$WALLET\",\"value\":\"$UNITS\",\"blockTsOffsetMs\":-7200000}" >/dev/null
check "tx older than order rejected" "$(V $ID $KEY $H | j error.code)" outside_window
H=$(hash); curl -s -X POST $RPC/__tx -d "{\"hash\":\"$H\",\"to\":\"$WALLET\",\"value\":\"$UNITS\",\"status\":\"0x0\"}" >/dev/null
check "reverted tx rejected" "$(V $ID $KEY $H | j error.code)" tx_failed

GOOD=$(hash); curl -s -X POST $RPC/__tx -d "{\"hash\":\"$GOOD\",\"to\":\"$WALLET\",\"value\":\"$UNITS\"}" >/dev/null
check "verify with wrong key rejected" "$(code -X POST $B/api/orders/$ID/verify -H 'content-type: application/json' -H 'x-order-key: nope' -d "{\"txHash\":\"$GOOD\"}")" 404
R=$(V $ID $KEY $GOOD); check "exact payment accepted" "$(echo "$R" | j order.status)" paid
URL=$(echo "$R" | j download.url); echo "download url issued: ${URL%/*}/<token>"
check "email status recorded" "$(echo "$R" | j order.emailStatus)" not_configured
check "re-verify same tx is idempotent" "$(V $ID $KEY $GOOD | j order.status)" paid
check "same tx cannot pay a second order" "$(V $ID2 $KEY2 $GOOD | j error.code)" tx_already_used
check "paid order rejects another tx" "$(V $ID $KEY $(hash) | j error.code)" already_paid

check "download works" "$(curl -s "$URL")" "TEST PRODUCT FILE - prompts pack"
check "download is attachment" "$(curl -s -D - -o /dev/null "$URL" | grep -ci 'content-disposition: attachment')" 1
for i in 3 4 5; do curl -s -o /dev/null "$URL"; done
check "link stops after 5 downloads" "$(code "$URL")" 410
check "forged token rejected" "$(code $B/api/download/$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'))" 404
check "new link needs key" "$(code -X POST $B/api/orders/$ID/download-link)" 404
check "unpaid order can't get link" "$(code -X POST -H "x-order-key: $KEY2" $B/api/orders/$ID2/download-link)" 402
NEW=$(curl -s -X POST -H "x-order-key: $KEY" $B/api/orders/$ID/download-link | j download.url)
check "fresh link works" "$(curl -s "$NEW")" "TEST PRODUCT FILE - prompts pack"
check "private file not in public site" "$(code $B/prompts-20)" 404

echo "---- $pass passed, $fail failed"
[ $fail -eq 0 ]
