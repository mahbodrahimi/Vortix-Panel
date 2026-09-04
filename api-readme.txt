## 📘 مستندات کامل API ساخت خودکار کاربر در Vortix Gateway (نسخه قابل کپی)

------------------------------------------------------------

این مستندات به صورت کامل، آموزش استفاده از API ساخت خودکار کاربر در سیستم Vortix Gateway را پوشش می‌دهد. با استفاده از این راهنما، هر توسعه‌دهنده‌ای می‌تواند در هر زبان برنامه‌نویسی، یک کلاینت برای ارتباط با این API پیاده‌سازی کند.

------------------------------------------------------------

### ۱. معرفی و هدف

API ساخت خودکار کاربر، یک رابط برنامه‌نویسی (RESTful) است که امکان ایجاد کاربر جدید در سیستم Vortix Gateway را بدون نیاز به ورود به پنل وب فراهم می‌کند. این API برای اتوماسیون، سیستم‌های فروشگاهی، ربات‌های تلگرام و هر سناریوی دیگری که نیاز به ایجاد کاربر به صورت برنامه‌نویسی دارد، طراحی شده است.

با یک درخواست ساده HTTP، کاربر ساخته می‌شود، محدودیت‌های تعیین‌شده برای او اعمال می‌گردد و در پاسخ، لینک اشتراک (Subscription URL) بازگردانده می‌شود که برای دریافت کانفیگ‌های پروکسی استفاده می‌شود.

------------------------------------------------------------

### ۲. احراز هویت (Authentication)

برای ارسال درخواست، باید یک کلید API معتبر در هدر درخواست ارسال کنید. کلیدهای API را می‌توانید از بخش "تنظیمات → کلیدهای API پنل" در داشبورد مدیریت ایجاد کنید.

نحوه ارسال کلید در هدر:
Authorization: Bearer YOUR_API_KEY

نکات مهم:
- کلید API با کلید اصلی (Master Key) تفاوت دارد و امنیت بیشتری برای دسترسی از راه دور فراهم می‌کند.
- کلید API تنها یک بار پس از ایجاد نمایش داده می‌شود، بنابراین حتماً آن را در جای امن ذخیره کنید.
- در صورت گم شدن کلید، باید آن را لغو (Revoke) کرده و یک کلید جدید ایجاد کنید.

------------------------------------------------------------

### ۳. آدرس و پارامترهای درخواست

آدرس پایه API به صورت زیر است (متد GET):

https://[your-worker-domain]/v1/[name]/[total]/[daily]/[expiry]

پارامترها به ترتیب در مسیر (Path) قرار می‌گیرند و به شرح زیر هستند:

- name (رشته، اجباری): نام کاربر. فقط شامل حروف، اعداد و زیرخط مجاز است. بدون فاصله.
- total (عدد، اجباری): محدودیت کل ترافیک بر حسب گیگابایت (GB). عدد مثبت یا صفر. صفر به معنای نامحدود است.
- daily (عدد، اجباری): محدودیت روزانه ترافیک بر حسب گیگابایت (GB). عدد مثبت یا صفر. صفر به معنای نامحدود است.
- expiry (عدد، اجباری): تعداد روزهای اعتبار کاربر. عدد مثبت یا صفر. صفر به معنای نامحدود (بدون انقضا) است.

مثال کامل:
https://panel.verota.workers.dev/v1/MyUser/10/2/30

این درخواست یک کاربر با نام MyUser، محدودیت کل ۱۰ گیگابایت، محدودیت روزانه ۲ گیگابایت و اعتبار ۳۰ روز ایجاد می‌کند.

------------------------------------------------------------

### ۴. نمونه درخواست با cURL

برای تست سریع، می‌توانید از دستور cURL زیر استفاده کنید (همه در یک خط):

curl -X GET "https://panel.verota.workers.dev/v1/MyUser/10/2/30" -H "Authorization: Bearer vortix_abc123..."

توجه: در ویندوز (CMD) از کاراکتر \ برای ادامه خط استفاده نکنید و دستور را به صورت یک خط کامل بنویسید.

------------------------------------------------------------

### ۵. پاسخ‌های سرور

پاسخ سرور همواره با فرمت JSON بازگردانده می‌شود و شامل فیلدهای زیر است.

پاسخ موفق (کد وضعیت ۲۰۱):

{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "MyUser",
    "totalLimitGB": 10,
    "dailyLimitGB": 2,
    "expiryDate": "2026-10-04"
  },
  "subscriptionUrl": "https://panel.verota.workers.dev/sync?sub=550e8400-e29b-41d4-a716-446655440000"
}

توضیح فیلدها:
- success: وضعیت موفقیت عملیات (true/false).
- user.id: شناسه یکتای کاربر (UUID).
- user.name: نام کاربر.
- user.totalLimitGB: محدودیت کل به گیگابایت.
- user.dailyLimitGB: محدودیت روزانه به گیگابایت.
- user.expiryDate: تاریخ انقضا به فرمت YYYY-MM-DD.
- subscriptionUrl: لینک اشتراک برای دریافت کانفیگ‌های پروکسی.

خطاهای رایج و کدهای وضعیت:

- 401 Unauthorized: کلید API نامعتبر یا ارسال نشده است.
  پاسخ: {"success":false,"error":"Unauthorized. Provide a valid Panel API Key in Authorization header."}

- 400 Bad Request: پارامترها نامعتبر هستند (مثلاً عدد منفی یا فرمت اشتباه).
  پاسخ: {"success":false,"error":"Invalid parameters. All limits must be non-negative numbers and name is required."}

- 409 Conflict: نام کاربر قبلاً در سیستم وجود دارد.
  پاسخ: {"success":false,"error":"A user with this name already exists."}

------------------------------------------------------------

### ۶. نکات مهم و ملاحظات

۱. واحد محدودیت‌ها: تمام محدودیت‌ها بر حسب گیگابایت (GB) محاسبه می‌شوند، نه تعداد درخواست.
۲. تاریخ انقضا: به فرمت YYYY-MM-DD بازگردانده می‌شود.
۳. نام کاربر: باید یکتا باشد و امکان ایجاد دو کاربر با نام یکسان وجود ندارد.
۴. امنیت: همیشه از کلید API (نه کلید اصلی) برای احراز هویت استفاده کنید.
۵. لینک اشتراک: بدون نیاز به احراز هویت، کانفیگ‌ها را در فرمت‌های مختلف (Base64, Clash, Sing-box و ...) ارائه می‌دهد.
۶. مدت زمان پاسخ: معمولاً کمتر از ۲ ثانیه است، اما در صورت بار بالا ممکن است تا ۵ ثانیه طول بکشد.
۷. نرخ محدودیت: در حال حاضر هیچ محدودیت نرخی اعمال نشده است، اما توصیه می‌شود از ارسال درخواست‌های همزمان زیاد خودداری شود.

------------------------------------------------------------

### ۷. نمونه کدهای پیاده‌سازی در زبان‌های مختلف

در ادامه، نمونه کدهایی برای زبان‌های محبوب ارائه شده است. تمام کدها فرض می‌کنند که متغیرهای baseUrl، apiKey، name، totalGb، dailyGb و expiryDays از قبل تعریف شده‌اند.

------------------------------------------------------------

#### پایتون (Python) با کتابخانه requests

import requests

def create_user(base_url, api_key, name, total_gb, daily_gb, expiry_days):
    url = f"{base_url.rstrip('/')}/v1/{name}/{total_gb}/{daily_gb}/{expiry_days}"
    headers = {"Authorization": f"Bearer {api_key}"}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()

# مثال استفاده
result = create_user(
    base_url="https://panel.verota.workers.dev",
    api_key="vortix_abc123...",
    name="MyUser",
    total_gb=10,
    daily_gb=2,
    expiry_days=30
)
print(f"✅ کاربر ایجاد شد: {result['user']['name']}")
print(f"🔗 لینک اشتراک: {result['subscriptionUrl']}")

------------------------------------------------------------

#### جاوااسکریپت (Node.js) با axios

const axios = require('axios');

async function createUser(baseUrl, apiKey, name, totalGb, dailyGb, expiryDays) {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/${name}/${totalGb}/${dailyGb}/${expiryDays}`;
    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000
    });
    return response.data;
}

(async () => {
    try {
        const result = await createUser(
            'https://panel.verota.workers.dev',
            'vortix_abc123...',
            'MyUser',
            10,
            2,
            30
        );
        console.log(`✅ کاربر ایجاد شد: ${result.user.name}`);
        console.log(`🔗 لینک اشتراک: ${result.subscriptionUrl}`);
    } catch (error) {
        console.error('❌ خطا:', error.message);
    }
})();

------------------------------------------------------------

#### PHP با cURL

<?php

function createUser($baseUrl, $apiKey, $name, $totalGb, $dailyGb, $expiryDays) {
    $url = rtrim($baseUrl, '/') . "/v1/{$name}/{$totalGb}/{$dailyGb}/{$expiryDays}";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer {$apiKey}",
        "Accept: application/json"
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($response === false) {
        throw new Exception("cURL error: " . curl_error($ch));
    }
    $data = json_decode($response, true);
    if ($httpCode >= 400) {
        throw new Exception("API Error (HTTP {$httpCode}): " . ($data['error'] ?? 'Unknown error'));
    }
    return $data;
}

try {
    $result = createUser(
        'https://panel.verota.workers.dev',
        'vortix_abc123...',
        'MyUser',
        10,
        2,
        30
    );
    echo "✅ کاربر ایجاد شد: " . $result['user']['name'] . "\n";
    echo "🔗 لینک اشتراک: " . $result['subscriptionUrl'] . "\n";
} catch (Exception $e) {
    echo "❌ خطا: " . $e->getMessage() . "\n";
}

------------------------------------------------------------

#### Go (Golang) با net/http

package main

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

type UserResponse struct {
    Success bool `json:"success"`
    User    struct {
        ID            string  `json:"id"`
        Name          string  `json:"name"`
        TotalLimitGB  float64 `json:"totalLimitGB"`
        DailyLimitGB  float64 `json:"dailyLimitGB"`
        ExpiryDate    string  `json:"expiryDate"`
    } `json:"user"`
    SubscriptionURL string `json:"subscriptionUrl"`
}

func createUser(baseUrl, apiKey, name string, totalGb, dailyGb float64, expiryDays int) (*UserResponse, error) {
    url := fmt.Sprintf("%s/v1/%s/%.0f/%.0f/%d", baseUrl, name, totalGb, dailyGb, expiryDays)
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Accept", "application/json")
    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }
    var result UserResponse
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }
    if !result.Success || resp.StatusCode >= 400 {
        return nil, fmt.Errorf("API error: %s", string(body))
    }
    return &result, nil
}

func main() {
    result, err := createUser(
        "https://panel.verota.workers.dev",
        "vortix_abc123...",
        "MyUser",
        10,
        2,
        30,
    )
    if err != nil {
        fmt.Println("❌ خطا:", err)
        return
    }
    fmt.Printf("✅ کاربر ایجاد شد: %s\n", result.User.Name)
    fmt.Printf("🔗 لینک اشتراک: %s\n", result.SubscriptionURL)
}

------------------------------------------------------------

#### Bash / Shell با curl

#!/bin/bash

BASE_URL="https://panel.verota.workers.dev"
API_KEY="vortix_abc123..."
NAME="MyUser"
TOTAL_GB=10
DAILY_GB=2
EXPIRY_DAYS=30

RESPONSE=$(curl -s -X GET \
    "${BASE_URL}/v1/${NAME}/${TOTAL_GB}/${DAILY_GB}/${EXPIRY_DAYS}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Accept: application/json")

if command -v jq &> /dev/null; then
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        echo "✅ کاربر ایجاد شد: $(echo "$RESPONSE" | jq -r '.user.name')"
        echo "🔗 لینک اشتراک: $(echo "$RESPONSE" | jq -r '.subscriptionUrl')"
    else
        echo "❌ خطا: $(echo "$RESPONSE" | jq -r '.error')"
    fi
else
    echo "$RESPONSE"
fi

------------------------------------------------------------

#### Java با OkHttp

import okhttp3.*;

import java.io.IOException;

public class VortixClient {
    private static final OkHttpClient client = new OkHttpClient();

    public static String createUser(String baseUrl, String apiKey, String name,
                                    double totalGb, double dailyGb, int expiryDays) throws IOException {
        String url = String.format("%s/v1/%s/%.0f/%.0f/%d",
                baseUrl.replaceAll("/$", ""), name, totalGb, dailyGb, expiryDays);
        Request request = new Request.Builder()
                .url(url)
                .addHeader("Authorization", "Bearer " + apiKey)
                .addHeader("Accept", "application/json")
                .build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Unexpected code " + response);
            }
            return response.body().string();
        }
    }

    public static void main(String[] args) throws IOException {
        String result = createUser(
                "https://panel.verota.workers.dev",
                "vortix_abc123...",
                "MyUser",
                10,
                2,
                30
        );
        System.out.println(result);
    }
}

------------------------------------------------------------

### ۸. جمع‌بندی و لینک مستندات کامل

این API راه‌حلی استاندارد، امن و سریع برای ایجاد خودکار کاربران در Vortix Gateway ارائه می‌دهد. با استفاده از این مستندات، هر توسعه‌دهنده‌ای می‌تواند در هر زبان برنامه‌نویسی، یک کلاینت مناسب برای ارتباط با این API پیاده‌سازی کند.

برای مشاهده مستندات کامل و به‌روز، به لینک زیر مراجعه کنید:
https://github.com/mahbodrahimi/Vortix-Panel/raw/refs/heads/main/api-readme.txt

در صورت بروز هرگونه مشکل یا سوال، از طریق لینک پشتیبانی تلگرام موجود در پنل با تیم پشتیبانی در ارتباط باشید.

موفق باشید! 🚀

------------------------------------------------------------
پایان مستندات
------------------------------------------------------------
