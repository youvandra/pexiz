import json,urllib.request,time,sys,datetime as dt
R="https://api.mainnet-beta.solana.com"
def rpc(m,p):
    for i in range(6):
        try:
            r=urllib.request.Request(R,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"Content-Type":"application/json"})
            j=json.load(urllib.request.urlopen(r,timeout=60))
            if "result" in j: return j["result"]
            time.sleep(3)
        except Exception as e: time.sleep(3)
acct=sys.argv[1]; stop=int(sys.argv[2]) # unix ts lower bound
before=None; out=[]
while True:
    p={"limit":1000}
    if before: p["before"]=before
    s=rpc("getSignaturesForAddress",[acct,p])
    if not s: break
    out+=s; before=s[-1]["signature"]
    t=s[-1].get("blockTime") or 0
    print(len(out),dt.datetime.utcfromtimestamp(t),file=sys.stderr)
    if t<stop: break
    time.sleep(0.5)
json.dump(out,open(f"sigs_{acct[:6]}.json","w"))
