<?php

use App\Http\Controllers\DashboardController;
use App\Models\Session;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::get('/', function () {
    return "Hello API";
});

Route::middleware(['shopify.auth'])->group(function () {

  Route::get('/dashboard', [DashboardController::class, 'index']);

});

Route::any('/getFunctions', function (Request $request) {
    $session = null;
    if(isset($request->shop)){
        $session = \App\Models\Session::where('shop',$request->shop)->first();
    }
    if($session == null){
        $session = \App\Models\Session::first();
    }
    $helper = new \App\Http\Controllers\HelperController();
    $query = <<<QUERY
  query {
  shopifyFunctions(first: 100) {
    nodes {
      app {
        title
      }
      apiType
      title
      id
    }
  }
}
QUERY;
   
    $res = $helper->getShopApi($session->shop)->graph($query);
    dd($res);
});

Route::any('/getFulfillmentContraints', function (Request $request) {
    $session = null;
    if(isset($request->shop)){
        $session = \App\Models\Session::where('shop',$request->shop)->first();
    }
    if($session == null){
        $session = \App\Models\Session::first();
    }
    $helper = new \App\Http\Controllers\HelperController();
    $query = <<<QUERY
  query {
  fulfillmentConstraintRules {
    id
    function{
        id
        inputQuery
        title
        useCreationUi
        description
        appKey
        appBridge{
            createPath
            detailsPath
        }
        apiType
    }
  }
}
QUERY;
  
    $res = $helper->getShopApi($session->shop)->graph($query);
    dd($res);
});

Route::any('/createFulfillmentContraints', function (Request $request) {
    if(isset($request->functionId) && $request->functionId != ""){
        
    }else{
        return response()->json([
           'status'=>'error',
           'message'=>'Fulfillment constraint functionId required!' 
        ]);
    }
    $helper = new \App\Http\Controllers\HelperController();
    $query = <<<QUERY
mutation fulfillmentConstraintRuleCreate(\$deliveryMethodTypes: [DeliveryMethodType!]!, \$functionId: String!) {
  fulfillmentConstraintRuleCreate(deliveryMethodTypes: \$deliveryMethodTypes, functionId: \$functionId) {
    fulfillmentConstraintRule {
        id
        function{
            id
            inputQuery
            title
            useCreationUi
            description
            appKey
            appBridge{
                createPath
                detailsPath
            }
            apiType
        }
    }
    userErrors {
      field
      message
    }
  }
}
QUERY;
    $variable = [
        "deliveryMethodTypes" => [
            "LOCAL",
            "SHIPPING",
            "PICK_UP",
            "PICKUP_POINT",
            "RETAIL",
        ],
        "functionId" => "gid://shopify/FulfillmentConstraintRule/"."$request->functionId"
    ];
    $session = null;
    if(isset($request->shop)){
        $session = \App\Models\Session::where('shop',$request->shop)->first();
    }
    if($session == null){
        $session = \App\Models\Session::first();
    }
    $res = $helper->getShopApi($session->shop)->graph($query,$variable);
    dd($res);
    // gid://shopify/FulfillmentConstraintRule/2621482
});


Route::post('/webhooks/uninstalled', function (Request $request) {
    try {
        $shop_name = $request->header('x-shopify-shop-domain');
        $session = Session::where('shop', $shop_name)->first();

        \Illuminate\Support\Facades\DB::table('sessions')->where('shop', $shop_name)->delete();
    } catch (Exception $e) {

    }
});


