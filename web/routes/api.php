<?php

use App\Http\Controllers\MetafieldController;
use App\Http\Controllers\UploadController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

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



Route::get('/get-address-data', [UploadController::class, 'get_address']);

Route::any('/add-address', [UploadController::class, 'add_address']);
Route::any('/delete-address/{id}', [UploadController::class, 'delete_address']);
Route::any('/update-address/{id}', [UploadController::class, 'update_address']);

Route::any('/metafield', [MetafieldController::class, 'metafield']);



