package rpc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/SkycoinProject/dmsg"
	dmsghttp "github.com/SkycoinProject/dmsg-http"
	"github.com/SkycoinProject/dmsg/cipher"
	"github.com/SkycoinProject/dmsg/disc"
	"github.com/btcsuite/btcd/btcjson"
	"github.com/btcsuite/btcutil"
)

const (
	dialTimeout         = 60 * time.Second
	httpClientTimeout   = 120 * time.Second
	tlsHandshakeTimeout = 60 * time.Second

	// ContentTypeJSON json content type header
	ContentTypeJSON = "application/json"
	// ContentTypeForm form data content type header
	ContentTypeForm = "application/x-www-form-urlencoded"
)

type Client struct {
	httpClient *http.Client
	addr       string
}

// rawResponse is a partially-unmarshaled JSON-RPC response.  For this
// to be valid (according to JSON-RPC 1.0 spec), ID may not be nil.
type rawResponse struct {
	Result json.RawMessage   `json:"result"`
	Error  *btcjson.RPCError `json:"error"`
}

func NewClient(addr string) *Client {
	discovery := disc.NewHTTP("http://dmsg.discovery.skywire.cc")
	cPK, cSK := cipher.GenerateKeyPair()
	dmsgClient := dmsg.NewClient(cPK, cSK, discovery, dmsg.DefaultConfig())
	go dmsgClient.Serve()

	time.Sleep(time.Second) // wait for dmsg client to be ready

	dmsgTransport := dmsghttp.Transport{
		DmsgClient: dmsgClient,
	}

	httpClient := &http.Client{
		Transport: dmsgTransport,
		Timeout:   httpClientTimeout,
	}
	addr = strings.TrimRight(addr, "/")
	addr += "/"
	return NewClientWithHTTPClient(addr, httpClient)
}

func NewClientWithHTTPClient(addr string, httpClient *http.Client) *Client {
	return &Client{
		httpClient: httpClient,
		addr:       addr,
	}
}

func (c *Client) GetBalance(account string) (*btcutil.Amount, error) {
	cmd := btcjson.NewGetBalanceCmd(&account, nil)

	resp, err := c.sendCmd(cmd)
	if err != nil {
		return nil, err
	}

	fmt.Println(resp)

	// Unmarshal result as a floating point number.
	var balance float64
	err = json.Unmarshal(resp.Result, &balance)
	if err != nil {
		return nil, err
	}

	amount, err := btcutil.NewAmount(balance)
	if err != nil {
		return nil, err
	}

	return &amount, nil

}

func (c *Client) sendCmd(cmd interface{}) (*rawResponse, error) {
	// Marshal the command.
	marshalledJSON, err := btcjson.MarshalCmd(1, cmd)
	if err != nil {
		return nil, err
	}

	bodyReader := bytes.NewReader(marshalledJSON)
	httpReq, err := http.NewRequest("POST", c.addr, bodyReader)
	if err != nil {
		return nil, err
	}

	httpReq.Close = true
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.SetBasicAuth("user", "password")
	httpResponse, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}

	// Read the raw bytes and close the response.
	respBytes, err := ioutil.ReadAll(httpResponse.Body)
	_ = httpResponse.Body.Close()
	if err != nil {
		return nil, err
	}

	var resp rawResponse
	err = json.Unmarshal(respBytes, &resp)
	if err != nil {
		return nil, err
	}

	return &resp, nil
}
