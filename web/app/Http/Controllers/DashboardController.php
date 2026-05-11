<?php

namespace App\Http\Controllers;

use App\Models\Plan;
use App\Models\Session;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public $helper;

    function __construct()
    {
        $this->helper = new HelperController();
    }

    public function index(Request $request){
        $session = $this->helper->getShop($request);

        $tokens = null;
        $createStorefrontToken = null;

        if ($session->storefront_token == null) {

            $tokens = $this->helper->getStorefrontToken($session);

            if($tokens['errors'] == false){
                $tokens = json_decode(json_encode($tokens['body']['data']['shop']['storefrontAccessTokens']['edges']), false);
                if(isset($tokens) && !empty($tokens)){
                    foreach($tokens as $token){
                         if(isset($token->node)
                            && isset($token->node->title)
                            && $token->node->title == 'web-checkout-address'){
                            $session->storefront_token = $token->node->accessToken;
                            $session->save();
                        }

                    }
                }

            }
            if($session->storefront_token == null){
                $createStorefrontToken = $this->helper->createStorefrontToken($session);
                if ($createStorefrontToken['errors'] == false) {
                    $createStorefrontToken = json_decode(json_encode($createStorefrontToken['body']['data']), false);
                    if (isset($createStorefrontToken->storefrontAccessTokenCreate->storefrontAccessToken)) {
                        $session->storefront_token = $createStorefrontToken->storefrontAccessTokenCreate->storefrontAccessToken->accessToken;
                        $session->save();
                    }
                }
            }

        }

        $createFulfillmentConstraintResponse = $this->createFulfillmentConstraint($session);

        return response()->json([
            'shop_data' => $session,
            'createStorefrontTokenresponse' => $createStorefrontToken,
            'createFulfillmentConstraintResponse' => $createFulfillmentConstraintResponse,
            'createStorefrontToken' => optional($session)->storefront_token,
            'listOfStorefrontTokens' => $tokens,
        ]);

    }

    public function createFulfillmentConstraint($session)
    {
        try {

            $fulfillmentConstraintFunctionId = null;

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

            $functions = $this->helper->getShopApi($session->shop)->graph($query);
            if ($functions['errors'] == false) {
                $functions = json_decode(json_encode($functions['body']['data']), false);
                if (isset($functions)
                    && isset($functions->shopifyFunctions)
                    && isset($functions->shopifyFunctions->nodes)
                    && !empty($functions->shopifyFunctions->nodes)
                ) {
                    foreach ($functions->shopifyFunctions->nodes as $node) {
                        if (isset($node->app) && isset($node->app->title)
                            && $node->app->title == 'Lego GWP+'
                            && isset($node->apiType)
                            && $node->apiType == 'fulfillment_constraints') {
                            $fulfillmentConstraintFunctionId = $node->id;
                        }
                    }
                }
            }

            if ($fulfillmentConstraintFunctionId == null) {
                return [
                    'type' => ' fulfillment constraint function id not found!',
                    'response' => $functions
                ];
            }

            $isFulfillmentConstarintRegistered = false;

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

            $res = $this->helper->getShopApi($session->shop)->graph($query);
            if ($res['errors'] == false) {
                $res = json_decode(json_encode($res['body']['data']), false);
                if (isset($res)
                    && isset($res->fulfillmentConstraintRules)
                    && !empty($res->fulfillmentConstraintRules)
                ) {
                    foreach ($res->fulfillmentConstraintRules as $rule) {
                        if (isset($rule->function) && isset($rule->function->apiType)
                            && $rule->function->apiType == 'fulfillment_constraints'
                        ) {
                            $isFulfillmentConstarintRegistered = true;
                        }
                    }
                }
            }

            if ($isFulfillmentConstarintRegistered == false) {
                if (isset($fulfillmentConstraintFunctionId)) {
                    return [
                        'type' => 'register fulfillment constraint',
                        'response' => $this->registerFulfillmentConstraint($session, $fulfillmentConstraintFunctionId)
                    ];
                }
            } else {
                return [
                    'type' => 'already registered fulfillment constraint',
                    'response' => $res
                ];
            }
        } catch (\Exception $exception) {

        }
    }

    public function registerFulfillmentConstraint($session, $fulfillmentConstraintFunctionId)
    {
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
            "functionId" => "$fulfillmentConstraintFunctionId"
        ];

        return $this->helper->getShopApi($session->shop)->graph($query, $variable);
    }

}
