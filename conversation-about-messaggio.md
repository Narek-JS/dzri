I need to take these 3 variable values

MESSAGGIO_PROJECT_LOGIN=<քո Project Login value>
MESSAGGIO_SENDER_CODE=<քո Sender code for API value>
MESSAGGIO_SECRET_KEY=<քո Secret Key value>  

let me know how should I find it

Դու արդեն ճիշտ Project-ի էջում ես։ Քո screenshot-ից արա հետևյալը.

Վերևի աջ մասում սեղմիր API Settings tab-ը։
Այդտեղ պետք է գտնես Project Login-ը և Secret Key-ը։ Եթե Secret Key դեռ չկա, պետք է սեղմես Generate secret key և հետո Save։ Messaggio-ի պաշտոնական guide-ն էլ հենց այս ճանապարհն է նշում։

Այսինքն՝

MESSAGGIO_PROJECT_LOGIN=<API Settings → Project Login>
MESSAGGIO_SECRET_KEY=<API Settings → Secret Key>
MESSAGGIO_SENDER_CODE-ի համար վերևի menu-ից սեղմիր Senders (կամ ձախից Senders)։

Բացիր այն Sender-ը, որով ուզում ես SMS ուղարկել → Detailed info / General information։ Այնտեղ փնտրիր Sender Code for API կամ Code for API։

Այսինքն վերջնականը կլինի՝

MESSAGGIO_PROJECT_LOGIN=xxxxxxxx
MESSAGGIO_SENDER_CODE=xxxxxxxx
MESSAGGIO_SECRET_KEY=xxxxxxxx

Քո այս screenshot-ում հենց API Settings-ը հաջորդ տեղն է, ուր պետք է մտնես։ Կարող ես դրա screenshot-ն էլ ուղարկել, և կասեմ կոնկրետ որ value-ն որտեղից copy անես։

Այո, այստեղ արդեն ունես MESSAGGIO_SECRET_KEY-ը՝ վերևի Secret Key դաշտի արժեքը։ Եթե key արդեն կա, նորից Generate Key մի սեղմիր, որովհետև դա կարող է փոխել գործող key-ը։

Մնացած երկուսը գտնելու համար՝

Ձախից սեղմիր Detailed info։ Այնտեղ պետք է երևա Project Login-ը, որը կդնես՝
MESSAGGIO_PROJECT_LOGIN=...

Messaggio-ի documentation-ը նշում է, որ Project Login-ը կարելի է վերցնել project-ի detailed information-ից։

Հետո ձախից սեղմիր Senders → բացիր քո ակտիվ sender-ը → Detailed info / Info։ Այնտեղ կլինի Sender Code for API։

Վերջում կունենաս՝

MESSAGGIO_PROJECT_LOGIN=<Detailed info-ից>
MESSAGGIO_SENDER_CODE=<Sender-ի Info-ից>
MESSAGGIO_SECRET_KEY=<այս screenshot-ի Secret Key-ը>

Ուղարկիր Detailed info-ի screenshot-ը, կասեմ կոնկրետ որ value-ն copy անես։

Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\WINDOWS\system32> $body = @{
>>     recipients = @(
>>         @{
>>             phone = "37498738617"
>>         }
>>     )
>>     channels = @("sms")
>>     sms = @{
>>         from = "dzri"
>>         content = @(
>>             @{
>>                 type = "text"
>>                 text = "test message"
>>             }
>>         )
>>     }
>> } | ConvertTo-Json -Depth 10 -Compress
PS C:\WINDOWS\system32>
PS C:\WINDOWS\system32> Invoke-RestMethod 
>>     -Uri "https://msg.messaggio.com/api/v1/send" 
>>     -Method POST 
>>     -Headers @{
>>         "Accept" = "application/json"
>>         "Messaggio-Login" = "d9u6rfn6lkus7398r34g"
>>     } 
>>     -ContentType "application/json" 
>>     -Body $body

accepted_at          messages
-----------          --------
2026-08-14T10-51-42Z {@{recipient=; message_id=e255605a-85cb-42de-885a-8710378b8d14}}


PS C:\WINDOWS\system32>




Yes. Your previous response only meant the message was accepted for processing, not delivered. Messaggio provides a separate status endpoint:

GET https://msg.messaggio.com/api/v1/status/{message-id}

Use your message ID:

e255605a-85cb-42de-885a-8710378b8d14

Run this in PowerShell:

Invoke-RestMethod `
  -Uri "https://msg.messaggio.com/api/v1/status/e255605a-85cb-42de-885a-8710378b8d14" `
  -Method GET `
  -Headers @{
      "Messaggio-Login" = "d9u6rfn6lkus7398r34g"
      "Accept" = "application/json"
  }

Messaggio documents this GET /api/v1/status/{message-id} endpoint specifically for checking delivery status.

The important status codes are:

200 = accepted by Messaggio
100 = sent to mobile operator/provider
70  = delivered to recipient
60  = SMS not delivered


98  = sender code/name problem
97  = request error
94  = missing/incorrect parameter
89  = IP not allowed
198 = blocked by antifraud
199 = duplicate message within ~15 minutes

For your SMS, the result we want is:

status = 70

If you get 100, Messaggio handed it to the mobile operator but has not received a delivery confirmation yet. If you get 60, it failed delivery.

Run that PowerShell command and paste the response here. Then I can tell you exactly why it was not received.

PS C:\WINDOWS\system32> Invoke-RestMethod 
>>   -Uri "https://msg.messaggio.com/api/v1/status/e255605a-85cb-42de-885a-8710378b8d14" 
>>   -Method GET 
>>   -Headers @{
>>       "Messaggio-Login" = "d9u6rfn6lkus7398r34g"
>>       "Accept" = "application/json"
>>   }
Invoke-RestMethod :
404 Not Found
404 Not Found
nginx
At line:1 char:1
+ Invoke-RestMethod 
+ ~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : InvalidOperation: (System.Net.HttpWebRequest:HttpWebRequest) [Invoke-RestMethod], WebException
    + FullyQualifiedErrorId : WebCmdletWebResponseException,Microsoft.PowerShell.Commands.InvokeRestMethodCommand

That 404 is useful: the GET /api/v1/status/{message-id} endpoint documented in Messaggio’s older 2021 PDF is currently returning 404 from their live gateway, so my previous status-check command was based on stale documentation. I verified the same URL now returns 404.

For current integrations, Messaggio’s documentation recommends receiving delivery reports through a callback/webhook URL configured under your project’s API Settings. Messaggio POSTs statuses such as 100 = sent to provider, 70 = delivered, and 60 = SMS not delivered to that URL.

For this already-sent message, first check the Messaggio dashboard around the sender/message statistics. Your message ID is:

e255605a-85cb-42de-885a-8710378b8d14

For the next test, the cleanest approach is to add a temporary callback directly in the send request:

$body = @{
    recipients = @(
        @{
            phone = "37498738617"
        }
    )
    channels = @("sms")
    options = @{
        dlr_callback_url = "YOUR_WEBHOOK_URL"
        external_id = "sms-test-001"
    }
    sms = @{
        from = "dzri"
        content = @(
            @{
                type = "text"
                text = "test message"
            }
        )
    }
} | ConvertTo-Json -Depth 10 -Compress

Messaggio explicitly supports dlr_callback_url for delivery reports.

The callback will look approximately like:

{
  "message_id": "...",
  "channel": "sms",
  "timestamp": "...",
  "external_id": "sms-test-001",
  "type": "status",
  "status": 60
}

The key values are:

70  = delivered
60  = SMS not delivered
100 = sent to mobile operator/provider
98  = sender configuration problem
89  = IP not allowed
198 = blocked by antifraud

If you want, we can use a temporary webhook URL now and send one more SMS; then we'll see the exact delivery status live instead of guessing.

I recive a teset message to my phone

Good — that confirms the SMS flow is working end-to-end.

Your working setup is:

MESSAGGIO_PROJECT_LOGIN=d9u6rfn6lkus7398r34g
MESSAGGIO_SENDER_CODE=dzri
MESSAGGIO_SECRET_KEY=<your secret key>

And for sending with the current /api/v1/send request, you’re using:

Messaggio-Login → Project Login
sms.from        → Sender Code
Secret Key      → not used in this specific request

The earlier API response was enough to show acceptance, and the actual phone receipt confirms delivery.